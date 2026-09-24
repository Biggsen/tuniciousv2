import { describe, expect, it } from 'vitest'

import {
  editionsToTry,
  isReleaseAlignedWithAlbum,
  MAX_EDITION_ATTEMPTS,
} from '@/lib/import/tryEditionsInOrder'
import type { StagedAlbum } from '@/lib/import/types'
import type { MbReleaseDetail, MbReleaseRef } from '@/lib/musicbrainz/types'

function release(id: string, country?: string, date?: string): MbReleaseRef {
  return {
    id,
    title: 'Two Parts Viper',
    status: 'Official',
    country,
    date,
    'artist-credit': [{ name: "'68", artist: { id: 'artist-68', name: "'68" } }],
    'release-group': {
      id: 'rg-1',
      title: 'Two Parts Viper',
      'primary-type': 'Album',
    },
  }
}

const album: StagedAlbum = {
  id: 'album-1',
  albumUri: 'spotify:album:1',
  albumName: 'Two Parts Viper',
  albumArtist: "'68",
  releaseDate: '2017-06-02',
  status: 'pending',
  tracks: [],
  source: 'csv',
}

describe('editionsToTry', () => {
  it('prioritizes pickBestRelease then list order, capped at max attempts', () => {
    const releases = [
      release('us', 'US', '2017-06-02'),
      release('xw', 'XW', '2018-04-27'),
      release('c', 'DE', '2017-06-02'),
      release('d', 'FR', '2017-06-02'),
      release('e', 'JP', '2017-06-02'),
    ]

    const tried = editionsToTry(releases, album).map((r) => r.id)
    expect(tried[0]).toBe('xw')
    expect(tried).toEqual(['xw', 'us', 'c'])
    expect(MAX_EDITION_ATTEMPTS).toBe(3)
  })

  it('respects a custom max', () => {
    const releases = [release('a', 'US'), release('b', 'XW'), release('c', 'DE')]
    expect(editionsToTry(releases, album, 2).map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('returns fewer when the group is smaller than the cap', () => {
    expect(editionsToTry([release('only', 'US')], album).map((r) => r.id)).toEqual(['only'])
  })

  it('returns empty for no releases or non-positive max', () => {
    expect(editionsToTry([], album)).toEqual([])
    expect(editionsToTry([release('a', 'US')], album, 0)).toEqual([])
  })
})

describe('isReleaseAlignedWithAlbum', () => {
  const detail = {
    id: 'rel-1',
    title: 'Album',
    media: [
      {
        position: 1,
        format: 'CD',
        'track-count': 1,
        tracks: [{ id: 't1', position: 1, number: '1', title: 'Alpha', length: 1000 }],
      },
    ],
  } as unknown as MbReleaseDetail

  it('treats v1 source albums as aligned without track comparison', () => {
    const v1Album: StagedAlbum = {
      ...album,
      source: 'v1',
      tracks: [],
    }
    expect(isReleaseAlignedWithAlbum(v1Album, detail)).toBe(true)
  })

  it('still requires track alignment for csv albums', () => {
    const csvAlbum: StagedAlbum = {
      ...album,
      source: 'csv',
      tracks: [
        {
          trackUri: 'spotify:track:1',
          trackName: 'Different',
          artistName: "'68",
          discNumber: 1,
          trackNumber: 1,
        },
      ],
    }
    expect(isReleaseAlignedWithAlbum(csvAlbum, detail)).toBe(false)
  })
})
