import { describe, expect, it } from 'vitest'

import { countAlbumsResolveProgress } from '@/lib/youtube/albumResolve'
import type { Album } from '@/types/library'
import type { TrackYouTubeMapping } from '@/types/youtube'

function album(id: string, trackIds: string[]): Album {
  return {
    id,
    title: id,
    artist: 'Artist',
    artistId: 'artist-1',
    artistIds: [],
    tracks: trackIds.map((trackId, index) => ({
      id: trackId,
      trackNumber: String(index + 1),
      title: trackId,
    })),
    releaseMbid: 'mbid',
    importedAt: new Date(),
  }
}

function mapping(trackId: string): TrackYouTubeMapping {
  return {
    trackId,
    videoId: `video-${trackId}`,
    videoTitle: trackId,
    channelTitle: 'Channel',
    source: 'manual',
    resolvedAt: new Date(),
  }
}

describe('countAlbumsResolveProgress', () => {
  it('counts fully resolved albums and mapped tracks', () => {
    const albums = [
      album('a', ['t1', 't2']),
      album('b', ['t3']),
      album('c', ['t4', 't5']),
    ]
    const mappings = new Map([
      ['t1', mapping('t1')],
      ['t2', mapping('t2')],
      ['t3', mapping('t3')],
      ['t4', mapping('t4')],
    ])

    expect(countAlbumsResolveProgress(albums, mappings)).toEqual({
      albumCount: 3,
      resolvedAlbumCount: 2,
      trackCount: 5,
      resolvedTrackCount: 4,
    })
  })

  it('treats empty albums as unresolved', () => {
    expect(countAlbumsResolveProgress([album('empty', [])], new Map())).toEqual({
      albumCount: 1,
      resolvedAlbumCount: 0,
      trackCount: 0,
      resolvedTrackCount: 0,
    })
  })
})
