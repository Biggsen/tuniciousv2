import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  mergeHydratedPlayStats,
  mergePlayStats,
  nextPlaycountFromLastfm,
  type LastfmPlaycountMode,
} from '@/lib/sessions/playStats'
import type { TrackPlayStats } from '@/types/sessions'

export const usePlayStatsStore = defineStore('playStats', () => {
  const byTrackId = ref(new Map<string, TrackPlayStats>())

  function playcount(trackId: string): number {
    return byTrackId.value.get(trackId)?.playcount ?? 0
  }

  function isLoved(trackId: string): boolean {
    return byTrackId.value.get(trackId)?.loved === true
  }

  function patch(trackId: string, partial: Partial<TrackPlayStats>): void {
    const next = new Map(byTrackId.value)
    next.set(trackId, mergePlayStats(next.get(trackId), { trackId, ...partial }))
    byTrackId.value = next
  }

  function hydrate(stats: Map<string, TrackPlayStats>): void {
    if (stats.size === 0) return
    const next = new Map(byTrackId.value)
    for (const [trackId, value] of stats) {
      next.set(trackId, mergeHydratedPlayStats(next.get(trackId), value))
    }
    byTrackId.value = next
  }

  function increment(trackId: string): void {
    patch(trackId, {
      playcount: playcount(trackId) + 1,
      lastPlayedAt: new Date(),
    })
  }

  function applyFromLastfm(
    trackId: string,
    lastfmPlaycount: number,
    loved: boolean | undefined,
    mode: LastfmPlaycountMode,
  ): void {
    const partial: Partial<TrackPlayStats> = {
      playcount: nextPlaycountFromLastfm(playcount(trackId), lastfmPlaycount, mode),
      lastSyncedAt: new Date(),
      lastfmPlaycountAtSync: lastfmPlaycount,
    }
    if (loved !== undefined) {
      partial.loved = loved
    }
    patch(trackId, partial)
  }

  function setLoved(trackId: string, loved: boolean): void {
    patch(trackId, { loved })
  }

  function reset(): void {
    byTrackId.value = new Map()
  }

  return {
    byTrackId,
    playcount,
    isLoved,
    hydrate,
    increment,
    applyFromLastfm,
    setLoved,
    reset,
  }
})
