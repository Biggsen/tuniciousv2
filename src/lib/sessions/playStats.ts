import type { TrackPlayStats } from '@/types/sessions'

export type LastfmPlaycountMode = 'authoritative' | 'floor'

export function nextPlaycountFromLastfm(
  localPlaycount: number,
  lastfmPlaycount: number,
  mode: LastfmPlaycountMode,
): number {
  if (mode === 'authoritative') return lastfmPlaycount
  return Math.max(localPlaycount, lastfmPlaycount)
}

export function mergeHydratedPlayStats(
  current: TrackPlayStats | undefined,
  incoming: TrackPlayStats,
): TrackPlayStats {
  return {
    ...incoming,
    playcount: Math.max(current?.playcount ?? 0, incoming.playcount),
  }
}

export function mergePlayStats(
  current: TrackPlayStats | undefined,
  patch: Partial<TrackPlayStats> & { trackId: string },
): TrackPlayStats {
  return {
    trackId: patch.trackId,
    playcount: patch.playcount ?? current?.playcount ?? 0,
    loved: 'loved' in patch ? patch.loved : current?.loved,
    lastPlayedAt: 'lastPlayedAt' in patch ? patch.lastPlayedAt : current?.lastPlayedAt,
    lastSyncedAt: 'lastSyncedAt' in patch ? patch.lastSyncedAt : current?.lastSyncedAt,
    lastfmPlaycountAtSync:
      'lastfmPlaycountAtSync' in patch
        ? patch.lastfmPlaycountAtSync
        : current?.lastfmPlaycountAtSync,
  }
}
