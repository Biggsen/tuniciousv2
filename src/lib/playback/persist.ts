import type { PlaybackQueueItem } from '@/types/playback'

/** Pre-user-scoped key. Shared by every account in this browser. */
const LEGACY_STORAGE_KEY = 'tunicious-playback-state'

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

function storageKey(uid: string): string {
  return `tunicious.playback.${uid}`
}

function discardLegacyPlaybackState(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function savePlaybackState(
  uid: string,
  queue: PlaybackQueueItem[],
  currentIndex: number,
  sourcePlaylistId: string | null,
): void {
  discardLegacyPlaybackState()
  if (!uid) return

  if (currentIndex < 0 || !queue.length) {
    clearPlaybackState(uid)
    return
  }

  const item = queue[currentIndex]
  if (!item) {
    clearPlaybackState(uid)
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
    localStorage.setItem(storageKey(uid), JSON.stringify(state))
  } catch {
    // Storage full or unavailable — resume is best-effort
  }
}

export function loadPlaybackState(uid: string): PersistedPlaybackState | null {
  discardLegacyPlaybackState()
  if (!uid) return null

  try {
    const raw = localStorage.getItem(storageKey(uid))
    if (!raw) return null
    const state = JSON.parse(raw) as PersistedPlaybackState
    if (!state.albumId || !state.currentTrackId || state.currentIndex < 0) return null
    return state
  } catch {
    return null
  }
}

export function clearPlaybackState(uid: string): void {
  discardLegacyPlaybackState()
  if (!uid) return

  try {
    localStorage.removeItem(storageKey(uid))
  } catch {
    // ignore
  }
}
