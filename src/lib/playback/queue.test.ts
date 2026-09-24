import { describe, expect, it } from 'vitest'

import {
  pickRandomPlayableIndex,
  playlistMembersNeedHydration,
  shuffleQueueItems,
  shuffleResolvedQueueItems,
} from '@/lib/playback/queue'
import type { PlaylistMember } from '@/types/library'
import type { PlaybackQueueItem } from '@/types/playback'

function item(partial: Partial<PlaybackQueueItem> & Pick<PlaybackQueueItem, 'trackId'>): PlaybackQueueItem {
  return {
    albumId: 'a1',
    title: partial.title ?? partial.trackId,
    artist: 'Artist',
    albumTitle: 'Album',
    trackNumber: '1',
    videoId: null,
    sourceType: 'playlist',
    sourcePlaylistId: 'p1',
    ...partial,
  }
}

describe('pickRandomPlayableIndex', () => {
  it('returns -1 when nothing is resolved', () => {
    expect(pickRandomPlayableIndex([item({ trackId: 't1' }), item({ trackId: 't2' })])).toBe(-1)
  })

  it('returns the only playable index', () => {
    const queue = [
      item({ trackId: 't1' }),
      item({ trackId: 't2', videoId: 'v2' }),
      item({ trackId: 't3' }),
    ]
    expect(pickRandomPlayableIndex(queue)).toBe(1)
  })

  it('only picks indexes with a videoId', () => {
    const queue = [
      item({ trackId: 't1', videoId: 'v1' }),
      item({ trackId: 't2' }),
      item({ trackId: 't3', videoId: 'v3' }),
    ]
    for (let i = 0; i < 20; i++) {
      const index = pickRandomPlayableIndex(queue)
      expect([0, 2]).toContain(index)
    }
  })
})

describe('shuffleQueueItems', () => {
  it('keeps every track, including unresolved ones', () => {
    const original = [
      item({ trackId: 't1', videoId: 'v1', albumId: 'album-a' }),
      item({ trackId: 't2', albumId: 'album-a' }),
      item({ trackId: 't3', videoId: 'v3', albumId: 'album-b' }),
    ]
    const shuffled = shuffleQueueItems(original)
    expect(shuffled.map((row) => row.trackId).sort()).toEqual(['t1', 't2', 't3'])
    expect(shuffled).toHaveLength(3)
  })

  it('does not mutate the input array', () => {
    const original = [
      item({ trackId: 't1', videoId: 'v1' }),
      item({ trackId: 't2', videoId: 'v2' }),
    ]
    const copy = [...original]
    shuffleQueueItems(original)
    expect(original).toEqual(copy)
  })
})

describe('shuffleResolvedQueueItems', () => {
  it('drops unresolved items', () => {
    const shuffled = shuffleResolvedQueueItems([
      item({ trackId: 't1', videoId: 'v1' }),
      item({ trackId: 't2' }),
      item({ trackId: 't3', videoId: 'v3' }),
    ])
    expect(shuffled.map((row) => row.trackId).sort()).toEqual(['t1', 't3'])
    expect(shuffled.every((row) => row.videoId)).toBe(true)
  })
})

describe('playlistMembersNeedHydration', () => {
  it('detects empty tracklists and title-less stubs', () => {
    const emptyTracks: PlaylistMember = {
      membership: {
        albumId: 'a1',
        position: 0,
        addedAt: new Date(),
      },
      album: {
        id: 'a1',
        title: 'Album',
        artist: 'Artist',
        artistId: 'ar1',
        artistIds: ['ar1'],
        albumYear: '2020',
        releaseMbid: 'mbid',
        tracks: [],
        importedAt: new Date(),
      },
    }
    const stubTracks: PlaylistMember = {
      ...emptyTracks,
      album: {
        ...emptyTracks.album,
        tracks: [{ id: 't1', trackNumber: '1', title: '' }],
      },
    }
    const hydrated: PlaylistMember = {
      ...emptyTracks,
      album: {
        ...emptyTracks.album,
        tracks: [{ id: 't1', trackNumber: '1', title: 'Song' }],
      },
    }

    expect(playlistMembersNeedHydration([emptyTracks])).toBe(true)
    expect(playlistMembersNeedHydration([stubTracks])).toBe(true)
    expect(playlistMembersNeedHydration([hydrated])).toBe(false)
  })
})
