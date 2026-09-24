import { defineStore } from 'pinia'
import { computed, nextTick, ref } from 'vue'

import { getAlbumById } from '@/lib/album/firestore'
import {
  clearPlaybackState,
  loadPlaybackState,
  savePlaybackState,
} from '@/lib/playback/persist'
import {
  buildQueueFromAlbum,
  buildQueueFromPlaylist,
  shuffleQueueItems,
} from '@/lib/playback/queue'
import { listPlaylistMembers } from '@/lib/playlist/firestore'
import {
  onPaused,
  onPlaybackStop,
  onPlaying,
  onTrackEnd,
  onTrackStart,
  resetSessionTracking,
  updateTrackLength,
} from '@/lib/sessions/tracker'
import { handleTrackStarted } from '@/lib/lastfm/scrobble'
import type { YouTubePlayerInstance } from '@/lib/youtube/iframeApi'
import { YT_PLAYER_STATE } from '@/lib/youtube/iframeApi'
import { getMappingsForTrackIds, saveTrackMapping } from '@/lib/youtube/firestore'
import {
  findPlayableVideoForTrack,
  isTopicChannelTitle,
} from '@/lib/youtube/playlistResolve'
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import type { Album, PlaylistMember } from '@/types/library'
import type { PlaybackAudition, PlaybackQueueItem } from '@/types/playback'
import type { ListenEndReason } from '@/types/sessions'

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'buffering'

export const usePlaybackStore = defineStore('playback', () => {
  const queue = ref<PlaybackQueueItem[]>([])
  const sourcePlaylistId = ref<string | null>(null)
  const currentIndex = ref(-1)
  const status = ref<PlaybackStatus>('idle')
  const positionMs = ref(0)
  const durationMs = ref(0)
  const error = ref<string | null>(null)
  const audition = ref<PlaybackAudition | null>(null)
  const unplayableVideoIds = ref<string[]>([])

  let player: YouTubePlayerInstance | null = null
  let progressTimer: ReturnType<typeof setInterval> | null = null
  const playableSwapAttempted = new Set<string>()
  /** Mute-then-unmute: async queue loads drop the click gesture; muted autoplay is allowed. */
  let unmuteOnPlaying = false
  /** After one Sound tap, later tracks on a phone stay at that volume. */
  let soundUnlocked = false
  const needsSoundTap = ref(false)
  /** Video and position to put back when an audition ends. */
  let auditionRestore: { videoId: string | null; positionMs: number; status: PlaybackStatus } | null =
    null
  let pendingSeekSec: number | null = null
  /** Ignore the pause event fired while leaving an audition. */
  let discardPauseUntil = 0

  function playbackUid(): string | null {
    return useAuthStore().user?.uid ?? null
  }

  /**
   * Ensure the current queue item has an embeddable videoId:
   * - unresolved → Search once, persist mapping
   * - Topic mapping → Search once for a non-Topic stand-in
   * @returns true when the item is ready to load (has videoId)
   */
  async function ensurePlayableForCurrentItem(options: { force?: boolean } = {}): Promise<boolean> {
    const item = currentItem.value
    const uid = playbackUid()
    if (!item || !uid) return false

    if (item.mappingSource === 'manual' && item.videoId) {
      return !options.force
    }

    const needsResolve = !item.videoId
    const needsTopicSwap =
      Boolean(item.videoId) && (options.force || isTopicChannelTitle(item.channelTitle ?? ''))

    if (!needsResolve && !needsTopicSwap) return true
    if (playableSwapAttempted.has(item.trackId) && !options.force) {
      return Boolean(item.videoId)
    }
    if (!item.title?.trim()) return false

    playableSwapAttempted.add(item.trackId)
    status.value = 'buffering'

    const topicCandidate = item.videoId
      ? {
          videoId: item.videoId,
          title: item.title,
          channelId: item.channelId ?? '',
          channelTitle: item.channelTitle ?? '',
          durationMs: item.lengthMs,
        }
      : undefined
    const track = {
      id: item.trackId,
      trackNumber: item.trackNumber,
      title: item.title,
      lengthMs: item.lengthMs,
    }

    const playable = await findPlayableVideoForTrack(item.artist, track, topicCandidate)

    if (!playable) return false
    // After embed 101/150 (`force`), the same videoId would reload forever.
    if (playable.videoId === item.videoId) return !options.force

    const mapping = await saveTrackMapping(uid, {
      trackId: item.trackId,
      videoId: playable.videoId,
      videoTitle: playable.title,
      channelTitle: playable.channelTitle,
      channelId: playable.channelId,
      durationMs: playable.durationMs,
      source: 'auto',
      searchQuery: needsResolve
        ? `on-demand-resolve:${playable.channelId}`
        : `on-demand-playable:${playable.channelId}`,
    })

    const index = currentIndex.value
    if (index < 0 || !queue.value[index]) return false

    const nextQueue = [...queue.value]
    nextQueue[index] = {
      ...nextQueue[index],
      videoId: playable.videoId,
      channelTitle: playable.channelTitle,
      channelId: playable.channelId,
      lengthMs: playable.durationMs ?? nextQueue[index].lengthMs,
      mappingSource: 'auto',
    }
    queue.value = nextQueue
    useLibraryStore().upsertMappings([mapping])
    return true
  }

  async function prepareAndLoadCurrentVideo(autoplay = true): Promise<boolean> {
    const ready = await ensurePlayableForCurrentItem()
    if (!ready || !activeVideoId.value) return false
    // Let the mobile stage grow into the viewport before playVideo().
    await nextTick()
    loadCurrentVideo(autoplay)
    return true
  }

  function enableSound() {
    soundUnlocked = true
    needsSoundTap.value = false
    unmuteOnPlaying = false
    if (!player) return
    try {
      player.unMute()
    } catch {
      /* ignore */
    }
    player.playVideo()
    status.value = 'playing'
    startProgressTimer()
  }

  async function trackCurrentItem() {
    const uid = playbackUid()
    const item = currentItem.value
    if (!uid || !item?.videoId) return

    await onTrackStart(uid, item, item.lengthMs ?? (durationMs.value || undefined))
    if (status.value === 'playing') {
      onPlaying()
    }
    void handleTrackStarted(uid, item, item.lengthMs ?? (durationMs.value || undefined))
  }

  const trackCount = computed(() => queue.value.length)
  const resolvedCount = computed(() => queue.value.filter((item) => item.videoId).length)
  const unresolvedCount = computed(() => queue.value.filter((item) => !item.videoId).length)
  const currentItem = computed(() =>
    currentIndex.value >= 0 ? (queue.value[currentIndex.value] ?? null) : null,
  )
  const activeVideoId = computed(() => currentItem.value?.videoId ?? null)
  const showPlayerBar = computed(
    () => audition.value !== null || (queue.value.length > 0 && currentIndex.value >= 0),
  )
  const isPlaying = computed(() => status.value === 'playing')

  function registerPlayer(instance: YouTubePlayerInstance) {
    player = instance
  }

  function unregisterPlayer() {
    stopProgressTimer()
    player = null
  }

  function stopProgressTimer() {
    if (progressTimer) {
      clearInterval(progressTimer)
      progressTimer = null
    }
  }

  function startProgressTimer() {
    stopProgressTimer()
    progressTimer = setInterval(() => {
      if (!player || status.value !== 'playing') return
      if (!audition.value) onPlaying()
      positionMs.value = Math.round(player.getCurrentTime() * 1000)
      const duration = player.getDuration()
      if (duration > 0) {
        const ms = Math.round(duration * 1000)
        durationMs.value = ms
        if (!audition.value) updateTrackLength(ms)
      }
    }, 500)
  }

  /** Advance from `fromIndex`, resolving unmapped tracks on demand until one loads. */
  async function startPlayback(fromIndex = 0) {
    discardAudition()
    error.value = null
    if (queue.value.length === 0) {
      error.value = 'No tracks to play'
      return false
    }

    const start = Math.max(0, Math.min(fromIndex, queue.value.length - 1))
    const order: number[] = []
    for (let index = start; index < queue.value.length; index++) order.push(index)
    for (let index = 0; index < start; index++) order.push(index)

    for (const index of order) {
      currentIndex.value = index
      positionMs.value = 0
      durationMs.value = currentItem.value?.lengthMs ?? 0
      status.value = 'playing'
      const loaded = await prepareAndLoadCurrentVideo(true)
      if (loaded) {
        void trackCurrentItem()
        persistState()
        return true
      }
      error.value = `No YouTube match for “${currentItem.value?.title ?? 'track'}” — trying next…`
    }

    error.value = 'Could not find playable YouTube matches in this queue'
    status.value = 'idle'
    return false
  }

  async function playFromPlaylist(members: PlaylistMember[], playlistId: string, uid: string) {
    await setQueueFromPlaylist(members, playlistId, uid)
    return startPlayback(0)
  }

  async function playFromPlaylistAtTrack(
    members: PlaylistMember[],
    playlistId: string,
    uid: string,
    trackId: string,
    albumId: string,
  ) {
    await setQueueFromPlaylist(members, playlistId, uid)
    const index = queue.value.findIndex(
      (item) => item.trackId === trackId && item.albumId === albumId,
    )
    if (index < 0) {
      error.value = 'This track is not in the playlist'
      return false
    }
    return startPlayback(index)
  }

  async function playRandomFromPlaylist(
    members: PlaylistMember[],
    playlistId: string,
    uid: string,
  ) {
    await setQueueFromPlaylist(members, playlistId, uid)
    if (queue.value.length === 0) {
      error.value = 'No tracks to play'
      return false
    }
    queue.value = shuffleQueueItems(queue.value)
    return startPlayback(0)
  }

  function loadCurrentVideo(autoplay = true) {
    if (!player || !activeVideoId.value) return
    player.loadVideoById(activeVideoId.value)
    if (autoplay) {
      const coarse = window.matchMedia('(pointer: coarse)').matches
      if (!coarse) {
        // After awaits (mappings fetch), Chrome blocks unmuted autoplay — start muted.
        needsSoundTap.value = false
        try {
          player.mute()
          unmuteOnPlaying = true
        } catch {
          unmuteOnPlaying = false
        }
      } else if (soundUnlocked && navigator.userActivation?.isActive) {
        unmuteOnPlaying = false
        needsSoundTap.value = false
        try {
          player.unMute()
        } catch {
          /* ignore */
        }
      } else if (soundUnlocked) {
        // Volume was unlocked by a real tap. Leave it alone; unMute here would pause iOS.
        unmuteOnPlaying = false
        needsSoundTap.value = false
      } else {
        // Phone: play muted so the embed actually starts, then one Sound tap unmutes in a gesture.
        try {
          player.mute()
        } catch {
          /* ignore */
        }
        unmuteOnPlaying = false
        needsSoundTap.value = true
      }
      player.playVideo()
      status.value = 'playing'
      startProgressTimer()
    }
  }

  async function setQueueFromPlaylist(members: PlaylistMember[], playlistId: string, uid: string) {
    const trackIds = members.flatMap((member) => member.album.tracks.map((track) => track.id))
    const mappings = await getMappingsForTrackIds(uid, trackIds)
    queue.value = buildQueueFromPlaylist(members, playlistId, mappings)
    sourcePlaylistId.value = playlistId
  }

  async function setQueueFromAlbum(album: Album, uid: string) {
    const mappings = await getMappingsForTrackIds(
      uid,
      album.tracks.map((track) => track.id),
    )
    queue.value = buildQueueFromAlbum(album, mappings)
    sourcePlaylistId.value = null
  }

  function persistState() {
    const uid = playbackUid()
    if (!uid) return
    savePlaybackState(uid, queue.value, currentIndex.value, sourcePlaylistId.value)
  }

  async function playFromAlbum(album: Album, uid: string) {
    await setQueueFromAlbum(album, uid)
    return startPlayback(0)
  }

  async function playFromAlbumAtTrack(album: Album, uid: string, trackIndex: number) {
    await setQueueFromAlbum(album, uid)
    return startPlayback(trackIndex)
  }

  function play() {
    if (audition.value) {
      if (!player) {
        status.value = 'playing'
        return
      }
      unmuteOnPlaying = false
      try {
        player.unMute()
      } catch {
        /* ignore */
      }
      player.playVideo()
      status.value = 'playing'
      startProgressTimer()
      return
    }

    if (!activeVideoId.value) return
    if (!player) {
      status.value = 'playing'
      return
    }
    // Direct user gesture — unmuted play is allowed.
    unmuteOnPlaying = false
    needsSoundTap.value = false
    soundUnlocked = true
    try {
      player.unMute()
    } catch {
      /* ignore */
    }
    player.playVideo()
    status.value = 'playing'
    onPlaying()
    startProgressTimer()
  }

  function pause() {
    player?.pauseVideo()
    status.value = 'paused'
    onPaused()
    stopProgressTimer()
  }

  function togglePlayPause() {
    if (status.value === 'playing') {
      pause()
      return
    }
    play()
  }

  async function next(endReason: ListenEndReason = 'skipped') {
    const saved = discardAudition()
    if (saved) positionMs.value = saved.positionMs
    if (currentIndex.value < 0) return

    const uid = playbackUid()
    if (uid) await onTrackEnd(endReason)

    for (let index = currentIndex.value + 1; index < queue.value.length; index++) {
      currentIndex.value = index
      positionMs.value = 0
      durationMs.value = currentItem.value?.lengthMs ?? 0
      status.value = 'playing'
      const loaded = await prepareAndLoadCurrentVideo(true)
      if (loaded) {
        void trackCurrentItem()
        persistState()
        return
      }
      error.value = `No YouTube match for “${currentItem.value?.title ?? 'track'}” — skipping`
    }

    await stop()
  }

  async function previous() {
    const leftAudition = audition.value !== null
    const saved = discardAudition()
    if (saved) positionMs.value = saved.positionMs
    if (currentIndex.value < 0) return

    if (leftAudition && positionMs.value > 3000 && activeVideoId.value) {
      positionMs.value = 0
      loadCurrentVideo(true)
      return
    }

    if (positionMs.value > 3000 && player) {
      player.seekTo(0, true)
      positionMs.value = 0
      return
    }

    const uid = playbackUid()
    if (uid) await onTrackEnd('skipped')

    for (let index = currentIndex.value - 1; index >= 0; index--) {
      currentIndex.value = index
      positionMs.value = 0
      durationMs.value = currentItem.value?.lengthMs ?? 0
      status.value = 'playing'
      const loaded = await prepareAndLoadCurrentVideo(true)
      if (loaded) {
        void trackCurrentItem()
        persistState()
        return
      }
    }

    if (player) {
      player.seekTo(0, true)
      positionMs.value = 0
    }
  }

  function onPlayerReady() {
    if (audition.value) {
      loadAuditionVideo()
      return
    }
    if (
      (status.value === 'playing' || status.value === 'buffering') &&
      activeVideoId.value
    ) {
      void prepareAndLoadCurrentVideo(true)
    }
  }

  function onPlayerStateChange(state: number) {
    if (state === YT_PLAYER_STATE.PAUSED && Date.now() < discardPauseUntil) return

    if (
      state === YT_PLAYER_STATE.PLAYING ||
      state === YT_PLAYER_STATE.PAUSED ||
      state === YT_PLAYER_STATE.CUED
    ) {
      consumePendingSeek()
    }

    if (audition.value) {
      if (state === YT_PLAYER_STATE.PLAYING) {
        status.value = 'playing'
        startProgressTimer()
        return
      }
      if (state === YT_PLAYER_STATE.PAUSED) {
        status.value = 'paused'
        stopProgressTimer()
        return
      }
      if (state === YT_PLAYER_STATE.BUFFERING) {
        status.value = 'buffering'
        return
      }
      if (state === YT_PLAYER_STATE.ENDED) {
        status.value = 'paused'
        stopProgressTimer()
        return
      }
      return
    }

    if (state === YT_PLAYER_STATE.PLAYING) {
      if (unmuteOnPlaying) {
        unmuteOnPlaying = false
        try {
          player?.unMute()
        } catch {
          /* ignore */
        }
      }
      status.value = 'playing'
      onPlaying()
      startProgressTimer()
      return
    }

    if (state === YT_PLAYER_STATE.PAUSED) {
      status.value = 'paused'
      onPaused()
      stopProgressTimer()
      return
    }

    if (state === YT_PLAYER_STATE.BUFFERING) {
      status.value = 'buffering'
      onPaused()
      return
    }

    if (state === YT_PLAYER_STATE.ENDED) {
      void next('completed')
    }
  }

  function onPlayerError(errorCode?: number) {
    if (audition.value) {
      const videoId = audition.value.videoId
      if (!unplayableVideoIds.value.includes(videoId)) {
        unplayableVideoIds.value = [...unplayableVideoIds.value, videoId]
      }
      error.value = null
      endAudition()
      return
    }

    const embedBlocked = errorCode === 101 || errorCode === 150
    void (async () => {
      if (embedBlocked) {
        const swapped = await ensurePlayableForCurrentItem({ force: true })
        if (swapped) {
          error.value = null
          status.value = 'playing'
          loadCurrentVideo(true)
          void trackCurrentItem()
          persistState()
          return
        }
      }

      error.value = embedBlocked
        ? 'This video blocks embedding (common for Topic uploads) — skipping'
        : 'YouTube playback failed for this track — skipping'
      await next('error')
    })()
  }

  async function stop() {
    if (audition.value) {
      endAudition()
      return
    }

    const uid = playbackUid()
    if (uid) await onPlaybackStop('stopped')

    const resumeIndex = currentIndex.value
    if (uid && resumeIndex >= 0) {
      savePlaybackState(uid, queue.value, resumeIndex, sourcePlaylistId.value)
    }

    player?.stopVideo()
    stopProgressTimer()
    status.value = 'idle'
    needsSoundTap.value = false
    currentIndex.value = -1
    positionMs.value = 0
    durationMs.value = 0
  }

  async function clearQueue() {
    discardAudition()
    const uid = playbackUid()
    if (uid) await onPlaybackStop('queue_cleared')

    player?.stopVideo()
    stopProgressTimer()
    status.value = 'idle'
    needsSoundTap.value = false
    currentIndex.value = -1
    positionMs.value = 0
    durationMs.value = 0
    queue.value = []
    sourcePlaylistId.value = null
    error.value = null
    playableSwapAttempted.clear()
    if (uid) clearPlaybackState(uid)
    await resetSessionTracking()
  }

  /** Stop playback for an account switch without deleting that account's resume. */
  function releaseSession(uid: string | null) {
    discardAudition()
    if (uid && currentIndex.value >= 0) {
      savePlaybackState(uid, queue.value, currentIndex.value, sourcePlaylistId.value)
    }

    player?.stopVideo()
    stopProgressTimer()
    status.value = 'idle'
    needsSoundTap.value = false
    currentIndex.value = -1
    positionMs.value = 0
    durationMs.value = 0
    queue.value = []
    sourcePlaylistId.value = null
    error.value = null
    playableSwapAttempted.clear()
    void onPlaybackStop('stopped').finally(() => {
      void resetSessionTracking()
    })
  }

  async function resumeFromPersisted(uid: string): Promise<boolean> {
    if (currentIndex.value >= 0) {
      play()
      return true
    }

    const persisted = loadPlaybackState(uid)
    if (!persisted) return false

    try {
      if (persisted.sourceType === 'playlist' && persisted.sourcePlaylistId) {
        const members = await listPlaylistMembers(uid, persisted.sourcePlaylistId, {
          fullAlbums: true,
        })
        if (!members.length) return false
        await setQueueFromPlaylist(members, persisted.sourcePlaylistId, uid)
      } else {
        const album = await getAlbumById(uid, persisted.albumId)
        if (!album) return false
        await setQueueFromAlbum(album, uid)
      }

      const trackIndex = queue.value.findIndex(
        (item) => item.trackId === persisted.currentTrackId,
      )
      const fromIndex = trackIndex >= 0 ? trackIndex : persisted.currentIndex
      return startPlayback(fromIndex)
    } catch {
      return false
    }
  }

  const hasPersistedPlayback = computed(() => {
    const uid = playbackUid()
    return uid ? loadPlaybackState(uid) !== null : false
  })

  function consumePendingSeek() {
    if (pendingSeekSec === null || !player || audition.value) return
    const seconds = pendingSeekSec
    pendingSeekSec = null
    if (seconds > 0.5) player.seekTo(seconds, true)
    positionMs.value = Math.round(seconds * 1000)
  }

  function loadAuditionVideo() {
    if (!player || !audition.value) return
    player.loadVideoById(audition.value.videoId)
    unmuteOnPlaying = false
    try {
      player.unMute()
    } catch {
      /* ignore */
    }
    player.playVideo()
    status.value = 'playing'
    startProgressTimer()
  }

  function discardAudition() {
    const wasAuditioning = audition.value !== null
    const saved = auditionRestore
    audition.value = null
    auditionRestore = null
    pendingSeekSec = null
    if (wasAuditioning) {
      discardPauseUntil = Date.now() + 500
      player?.pauseVideo()
    }
    return saved
  }

  function restorePlayback(saved: { videoId: string | null; positionMs: number; status: PlaybackStatus }) {
    positionMs.value = saved.positionMs
    durationMs.value = currentItem.value?.lengthMs ?? 0
    if (!saved.videoId || !player) {
      player?.stopVideo()
      stopProgressTimer()
      status.value = currentIndex.value >= 0 ? 'paused' : 'idle'
      return
    }

    pendingSeekSec = saved.positionMs / 1000
    player.loadVideoById(saved.videoId)
    const resume = saved.status === 'playing' || saved.status === 'buffering'
    if (resume) {
      try {
        player.unMute()
      } catch {
        /* ignore */
      }
      player.playVideo()
      status.value = 'playing'
      startProgressTimer()
      onPlaying()
    } else {
      player.pauseVideo()
      status.value = 'paused'
      stopProgressTimer()
    }
  }

  function endAudition() {
    const saved = discardAudition()
    if (!saved) return
    onPaused()
    restorePlayback(saved)
  }

  function startAudition(input: PlaybackAudition) {
    if (unplayableVideoIds.value.includes(input.videoId)) return
    if (!audition.value) {
      onPaused()
      auditionRestore = {
        videoId: activeVideoId.value,
        positionMs: positionMs.value,
        status: status.value,
      }
    }
    audition.value = input
    error.value = null
    positionMs.value = 0
    durationMs.value = 0
    pendingSeekSec = null
    loadAuditionVideo()
  }

  function patchQueueMapping(
    trackId: string,
    video: {
      videoId: string
      channelTitle?: string
      channelId?: string
      durationMs?: number
    },
  ) {
    let changed = false
    const next = queue.value.map((item) => {
      if (item.trackId !== trackId) return item
      changed = true
      return {
        ...item,
        videoId: video.videoId,
        channelTitle: video.channelTitle,
        channelId: video.channelId,
        lengthMs: video.durationMs ?? item.lengthMs,
        mappingSource: 'manual' as const,
      }
    })
    if (changed) queue.value = next
  }

  function adoptManualMapping(
    trackId: string,
    video: {
      videoId: string
      channelTitle?: string
      channelId?: string
      durationMs?: number
    },
  ) {
    const previewingThis =
      audition.value?.trackId === trackId && audition.value.videoId === video.videoId
    patchQueueMapping(trackId, video)
    const isCurrent = currentItem.value?.trackId === trackId && currentIndex.value >= 0

    if (isCurrent && previewingThis) {
      audition.value = null
      auditionRestore = null
      pendingSeekSec = null
      if (status.value !== 'playing') {
        player?.seekTo(0, true)
        player?.playVideo()
        status.value = 'playing'
        startProgressTimer()
      }
      persistState()
      void trackCurrentItem()
      return
    }

    if (audition.value?.trackId === trackId) {
      const saved = discardAudition()
      if (!isCurrent && saved) restorePlayback(saved)
    }

    if (isCurrent) {
      positionMs.value = 0
      loadCurrentVideo(true)
      persistState()
      void trackCurrentItem()
    }
  }

  function patchTrackTitle(trackId: string, title: string): void {
    let changed = false
    const next = queue.value.map((item) => {
      if (item.trackId !== trackId) return item
      changed = true
      return { ...item, title }
    })
    if (changed) queue.value = next
  }

  return {
    queue,
    sourcePlaylistId,
    currentIndex,
    status,
    positionMs,
    durationMs,
    error,
    audition,
    unplayableVideoIds,
    trackCount,
    resolvedCount,
    unresolvedCount,
    currentItem,
    activeVideoId,
    showPlayerBar,
    isPlaying,
    needsSoundTap,
    registerPlayer,
    unregisterPlayer,
    setQueueFromPlaylist,
    setQueueFromAlbum,
    startPlayback,
    playFromPlaylist,
    playFromPlaylistAtTrack,
    playRandomFromPlaylist,
    playFromAlbum,
    playFromAlbumAtTrack,
    play,
    enableSound,
    pause,
    togglePlayPause,
    next,
    previous,
    onPlayerReady,
    onPlayerStateChange,
    onPlayerError,
    stop,
    clearQueue,
    releaseSession,
    resumeFromPersisted,
    hasPersistedPlayback,
    patchTrackTitle,
    startAudition,
    endAudition,
    adoptManualMapping,
  }
})
