import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadPlaylistTracklistOpen,
  savePlaylistTracklistOpen,
} from '@/lib/playlist/persistTracklist'

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

describe('persistTracklist', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  it('defaults to closed', () => {
    expect(loadPlaylistTracklistOpen('pl-1')).toBe(false)
  })

  it('remembers which playlists have the tracklist open', () => {
    savePlaylistTracklistOpen('pl-1', true)
    savePlaylistTracklistOpen('pl-2', true)
    savePlaylistTracklistOpen('pl-2', false)

    expect(loadPlaylistTracklistOpen('pl-1')).toBe(true)
    expect(loadPlaylistTracklistOpen('pl-2')).toBe(false)
  })
})
