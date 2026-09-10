import type { PlaybackQueueItem } from '@/types/playback'

const STORAGE_KEY = 'tunicious-playback-state'

export interface PersistedPlaybackState {
  sourceType: 'album' | 'playlist'
  sourcePlaylistId?: string
  albumId: string
  currentIndex: number
  currentTrackId: string
  title: string
  artist: string
  albumTitle: string
  savedAt: number
}

export function savePlaybackState(
  queue: PlaybackQueueItem[],
  currentIndex: number,
  sourcePlaylistId: string | null,
): void {
  if (currentIndex < 0 || !queue.length) {
    clearPlaybackState()
    return
  }

  const item = queue[currentIndex]
  if (!item) {
    clearPlaybackState()
    return
  }

  const state: PersistedPlaybackState = {
    sourceType: item.sourceType,
    sourcePlaylistId: sourcePlaylistId ?? item.sourcePlaylistId,
    albumId: item.albumId,
    currentIndex,
    currentTrackId: item.trackId,
    title: item.title,
    artist: item.artist,
    albumTitle: item.albumTitle,
    savedAt: Date.now(),
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable — resume is best-effort
  }
}

export function loadPlaybackState(): PersistedPlaybackState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const state = JSON.parse(raw) as PersistedPlaybackState
    if (!state.albumId || !state.currentTrackId || state.currentIndex < 0) return null
    return state
  } catch {
    return null
  }
}

export function clearPlaybackState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
