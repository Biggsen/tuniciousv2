import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { getAlbumById } from '@/lib/album/firestore'
import {
  clearPlaybackState,
  loadPlaybackState,
  savePlaybackState,
} from '@/lib/playback/persist'
import {
  buildQueueFromAlbum,
  buildQueueFromPlaylist,
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
import type { PlaybackQueueItem } from '@/types/playback'
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

  let player: YouTubePlayerInstance | null = null
  let progressTimer: ReturnType<typeof setInterval> | null = null
  const playableSwapAttempted = new Set<string>()
  /** Mute-then-unmute: async queue loads drop the click gesture; muted autoplay is allowed. */
  let unmuteOnPlaying = false

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
    if (playable.videoId === item.videoId) return true

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
    }
    queue.value = nextQueue
    useLibraryStore().upsertMappings([mapping])
    return true
  }

  async function prepareAndLoadCurrentVideo(autoplay = true): Promise<boolean> {
    const ready = await ensurePlayableForCurrentItem()
    if (!ready || !activeVideoId.value) return false
    loadCurrentVideo(autoplay)
    return true
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
  const showPlayerBar = computed(() => queue.value.length > 0 && currentIndex.value >= 0)
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
      onPlaying()
      positionMs.value = Math.round(player.getCurrentTime() * 1000)
      const duration = player.getDuration()
      if (duration > 0) {
        const ms = Math.round(duration * 1000)
        durationMs.value = ms
        updateTrackLength(ms)
      }
    }, 500)
  }

  /** Advance from `fromIndex`, resolving unmapped tracks on demand until one loads. */
  async function startPlayback(fromIndex = 0) {
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
    const startIndex = Math.floor(Math.random() * queue.value.length)
    return startPlayback(startIndex)
  }

  function loadCurrentVideo(autoplay = true) {
    if (!player || !activeVideoId.value) return
    player.loadVideoById(activeVideoId.value)
    if (autoplay) {
      // After awaits (mappings fetch), Chrome blocks unmuted autoplay — start muted.
      try {
        player.mute()
        unmuteOnPlaying = true
      } catch {
        unmuteOnPlaying = false
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
    savePlaybackState(queue.value, currentIndex.value, sourcePlaylistId.value)
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
    if (!activeVideoId.value) return
    if (!player) {
      status.value = 'playing'
      return
    }
    // Direct user gesture — unmuted play is allowed.
    unmuteOnPlaying = false
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
    if (currentIndex.value < 0) return

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
    if (
      (status.value === 'playing' || status.value === 'buffering') &&
      activeVideoId.value
    ) {
      void prepareAndLoadCurrentVideo(true)
    }
  }

  function onPlayerStateChange(state: number) {
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
    const uid = playbackUid()
    if (uid) await onPlaybackStop('stopped')

    const resumeIndex = currentIndex.value
    if (resumeIndex >= 0) {
      savePlaybackState(queue.value, resumeIndex, sourcePlaylistId.value)
    }

    player?.stopVideo()
    stopProgressTimer()
    status.value = 'idle'
    currentIndex.value = -1
    positionMs.value = 0
    durationMs.value = 0
  }

  async function clearQueue() {
    const uid = playbackUid()
    if (uid) await onPlaybackStop('queue_cleared')

    player?.stopVideo()
    stopProgressTimer()
    status.value = 'idle'
    currentIndex.value = -1
    positionMs.value = 0
    durationMs.value = 0
    queue.value = []
    sourcePlaylistId.value = null
    error.value = null
    playableSwapAttempted.clear()
    clearPlaybackState()
    await resetSessionTracking()
  }

  async function resumeFromPersisted(uid: string): Promise<boolean> {
    if (currentIndex.value >= 0) {
      play()
      return true
    }

    const persisted = loadPlaybackState()
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

  const hasPersistedPlayback = computed(() => loadPlaybackState() !== null)

  return {
    queue,
    sourcePlaylistId,
    currentIndex,
    status,
    positionMs,
    durationMs,
    error,
    trackCount,
    resolvedCount,
    unresolvedCount,
    currentItem,
    activeVideoId,
    showPlayerBar,
    isPlaying,
    registerPlayer,
    unregisterPlayer,
    setQueueFromPlaylist,
    setQueueFromAlbum,
    startPlayback,
    playFromPlaylist,
    playRandomFromPlaylist,
    playFromAlbum,
    playFromAlbumAtTrack,
    play,
    pause,
    togglePlayPause,
    next,
    previous,
    onPlayerReady,
    onPlayerStateChange,
    onPlayerError,
    stop,
    clearQueue,
    resumeFromPersisted,
    hasPersistedPlayback,
  }
})
