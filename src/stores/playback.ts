import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { buildQueueFromAlbum, buildQueueFromPlaylist } from '@/lib/playback/queue'
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
import { getMappingsForTrackIds } from '@/lib/youtube/firestore'
import { useAuthStore } from '@/stores/auth'
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

  function playbackUid(): string | null {
    return useAuthStore().user?.uid ?? null
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

  function findPlayableIndex(from: number, direction: 1 | -1): number {
    if (direction === 1) {
      for (let index = from; index < queue.value.length; index++) {
        if (queue.value[index]?.videoId) return index
      }
      return -1
    }

    for (let index = from; index >= 0; index--) {
      if (queue.value[index]?.videoId) return index
    }
    return -1
  }

  function loadCurrentVideo(autoplay = true) {
    if (!player || !activeVideoId.value) return
    player.loadVideoById(activeVideoId.value)
    if (autoplay) {
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

  function startPlayback(fromIndex = 0) {
    error.value = null
    const index = findPlayableIndex(fromIndex, 1)
    if (index < 0) {
      error.value = 'No resolved tracks to play'
      return false
    }

    currentIndex.value = index
    positionMs.value = 0
    durationMs.value = currentItem.value?.lengthMs ?? 0
    status.value = 'playing'
    loadCurrentVideo(true)
    void trackCurrentItem()
    return true
  }

  async function playFromPlaylist(members: PlaylistMember[], playlistId: string, uid: string) {
    await setQueueFromPlaylist(members, playlistId, uid)
    return startPlayback(0)
  }

  async function playFromAlbum(album: Album, uid: string) {
    await setQueueFromAlbum(album, uid)
    return startPlayback(0)
  }

  function play() {
    if (!activeVideoId.value) return
    if (!player) {
      status.value = 'playing'
      return
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

    const index = findPlayableIndex(currentIndex.value + 1, 1)
    if (index < 0) {
      await stop()
      return
    }
    currentIndex.value = index
    positionMs.value = 0
    durationMs.value = currentItem.value?.lengthMs ?? 0
    status.value = 'playing'
    loadCurrentVideo(true)
    void trackCurrentItem()
  }

  async function previous() {
    if (currentIndex.value < 0) return

    if (positionMs.value > 3000 && player) {
      player.seekTo(0, true)
      positionMs.value = 0
      return
    }

    const index = findPlayableIndex(currentIndex.value - 1, -1)
    if (index < 0) {
      if (player) {
        player.seekTo(0, true)
        positionMs.value = 0
      }
      return
    }

    const uid = playbackUid()
    if (uid) await onTrackEnd('skipped')

    currentIndex.value = index
    positionMs.value = 0
    durationMs.value = currentItem.value?.lengthMs ?? 0
    status.value = 'playing'
    loadCurrentVideo(true)
    void trackCurrentItem()
  }

  function onPlayerReady() {
    if (status.value === 'playing' && activeVideoId.value) {
      loadCurrentVideo(true)
    }
  }

  function onPlayerStateChange(state: number) {
    if (state === YT_PLAYER_STATE.PLAYING) {
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

  function onPlayerError() {
    error.value = 'YouTube playback failed for this track — skipping'
    void next('error')
  }

  async function stop() {
    const uid = playbackUid()
    if (uid) await onPlaybackStop('stopped')

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
    await resetSessionTracking()
  }

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
    playFromAlbum,
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
  }
})
