import type { PlaylistStats } from '@/lib/playlist/firestore'

const STORAGE_PREFIX = 'tunicious.playlists.stats.'

export interface PlaylistStatsCache {
  updatedAt: number
  byPlaylistId: Record<string, PlaylistStats>
}

function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`
}

function isPlaylistStats(value: unknown): value is PlaylistStats {
  if (!value || typeof value !== 'object') return false
  const stats = value as Partial<PlaylistStats>
  return (
    typeof stats.albumCount === 'number' &&
    typeof stats.trackCount === 'number' &&
    typeof stats.resolvedAlbumCount === 'number' &&
    typeof stats.resolvedTrackCount === 'number'
  )
}

export function loadPlaylistStatsCache(uid: string): PlaylistStatsCache | null {
  try {
    const raw = localStorage.getItem(storageKey(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PlaylistStatsCache>
    if (typeof parsed.updatedAt !== 'number' || !parsed.byPlaylistId || typeof parsed.byPlaylistId !== 'object') {
      return null
    }
    const byPlaylistId: Record<string, PlaylistStats> = {}
    for (const [playlistId, stats] of Object.entries(parsed.byPlaylistId)) {
      if (isPlaylistStats(stats)) byPlaylistId[playlistId] = stats
    }
    return { updatedAt: parsed.updatedAt, byPlaylistId }
  } catch {
    return null
  }
}

export function savePlaylistStatsCache(uid: string, stats: Map<string, PlaylistStats>): void {
  try {
    const payload: PlaylistStatsCache = {
      updatedAt: Date.now(),
      byPlaylistId: Object.fromEntries(stats.entries()),
    }
    localStorage.setItem(storageKey(uid), JSON.stringify(payload))
  } catch {
    // Storage unavailable — stats still work for this session.
  }
}

export function playlistStatsMapFromCache(
  cache: PlaylistStatsCache | null,
): Map<string, PlaylistStats> {
  if (!cache) return new Map()
  return new Map(Object.entries(cache.byPlaylistId))
}

export function removePlaylistFromStatsCache(uid: string, playlistId: string): void {
  const cache = loadPlaylistStatsCache(uid)
  if (!cache?.byPlaylistId[playlistId]) return
  const next = { ...cache.byPlaylistId }
  delete next[playlistId]
  try {
    localStorage.setItem(
      storageKey(uid),
      JSON.stringify({ updatedAt: cache.updatedAt, byPlaylistId: next } satisfies PlaylistStatsCache),
    )
  } catch {
    // Storage unavailable.
  }
}
