import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPlaybackState,
  loadPlaybackState,
  savePlaybackState,
} from '@/lib/playback/persist'
import type { PlaybackQueueItem } from '@/types/playback'

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
  return store
}

function item(title: string): PlaybackQueueItem {
  return {
    trackId: `track-${title}`,
    albumId: 'album-1',
    title,
    artist: 'De La Soul',
    albumTitle: 'Buhloone Mindstate',
    trackNumber: '1',
    videoId: null,
    sourceType: 'album',
  }
}

describe('playback persist', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  it('keeps each user resume separate', () => {
    savePlaybackState('uid-a', [item('Lord Intended')], 0, null)
    savePlaybackState('uid-b', [item('Potholes in My Lawn')], 0, null)

    expect(loadPlaybackState('uid-a')?.title).toBe('Lord Intended')
    expect(loadPlaybackState('uid-b')?.title).toBe('Potholes in My Lawn')
  })

  it('ignores and deletes the old shared resume key', () => {
    localStorage.setItem(
      'tunicious-playback-state',
      JSON.stringify({
        sourceType: 'album',
        albumId: 'album-1',
        currentIndex: 0,
        currentTrackId: 'track-old',
        title: 'Lord Intended',
        artist: 'De La Soul',
        albumTitle: 'Buhloone Mindstate',
        savedAt: 1,
      }),
    )

    expect(loadPlaybackState('uid-new')).toBeNull()
    expect(localStorage.getItem('tunicious-playback-state')).toBeNull()
  })

  it('clears only the requested user', () => {
    savePlaybackState('uid-a', [item('Lord Intended')], 0, null)
    savePlaybackState('uid-b', [item('Potholes in My Lawn')], 0, null)

    clearPlaybackState('uid-a')

    expect(loadPlaybackState('uid-a')).toBeNull()
    expect(loadPlaybackState('uid-b')?.title).toBe('Potholes in My Lawn')
  })
})