import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlaylistStats } from '@/lib/playlist/firestore'
import {
  loadPlaylistStatsCache,
  playlistStatsMapFromCache,
  removePlaylistFromStatsCache,
  savePlaylistStatsCache,
} from '@/lib/playlist/persistStats'

function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  })
}

const stats = (partial?: Partial<PlaylistStats>): PlaylistStats => ({
  albumCount: 2,
  trackCount: 20,
  resolvedAlbumCount: 1,
  resolvedTrackCount: 10,
  ...partial,
})

describe('persistStats', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  it('round-trips playlist stats cache', () => {
    savePlaylistStatsCache('uid-1', new Map([['pl-1', stats()]]))
    const cache = loadPlaylistStatsCache('uid-1')
    expect(cache?.byPlaylistId['pl-1']).toEqual(stats())
    expect(playlistStatsMapFromCache(cache).get('pl-1')).toEqual(stats())
  })

  it('removes a playlist from the cache', () => {
    savePlaylistStatsCache(
      'uid-1',
      new Map([
        ['pl-1', stats()],
        ['pl-2', stats({ albumCount: 1 })],
      ]),
    )
    removePlaylistFromStatsCache('uid-1', 'pl-1')
    const cache = loadPlaylistStatsCache('uid-1')
    expect(cache?.byPlaylistId['pl-1']).toBeUndefined()
    expect(cache?.byPlaylistId['pl-2']?.albumCount).toBe(1)
  })

  it('returns null for corrupt cache payloads', () => {
    localStorage.setItem('tunicious.playlists.stats.uid-1', '{')
    expect(loadPlaylistStatsCache('uid-1')).toBeNull()
  })
})
