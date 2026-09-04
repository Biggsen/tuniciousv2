import { describe, expect, it } from 'vitest'

import {
  applyAlbumEntryOverlay,
  filterTrackIdsByExclusions,
} from '@/lib/album/entryOverlay'
import type { Album, AlbumEntry } from '@/types/library'

function album(overrides: Partial<Album> = {}): Album {
  return {
    id: 'album-1',
    title: 'Ricochet',
    artist: 'Reso',
    artistId: 'artist-1',
    artistIds: ['artist-1'],
    albumYear: 2016,
    releaseMbid: 'mbid',
    tracks: [
      { id: 't1', trackNumber: '1', title: 'Taiga' },
      { id: 't2', trackNumber: '2', title: 'Move It' },
      { id: 't3', trackNumber: '3', title: 'Mix' },
    ],
    importedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function entry(overrides: Partial<AlbumEntry> = {}): AlbumEntry {
  return {
    albumId: 'album-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('applyAlbumEntryOverlay', () => {
  it('returns album unchanged when entry is missing', () => {
    const base = album()
    expect(applyAlbumEntryOverlay(base, null)).toBe(base)
    expect(applyAlbumEntryOverlay(base, undefined)).toBe(base)
  })

  it('filters excluded tracks', () => {
    const result = applyAlbumEntryOverlay(
      album(),
      entry({ excludedTrackIds: ['t3'] }),
    )
    expect(result.tracks.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('applies entry rating fields', () => {
    const result = applyAlbumEntryOverlay(
      album({ rating: 3 }),
      entry({ rating: 5, ratingSource: 'manual' }),
    )
    expect(result.rating).toBe(5)
    expect(result.ratingSource).toBe('manual')
  })
})

describe('filterTrackIdsByExclusions', () => {
  it('drops excluded ids', () => {
    expect(filterTrackIdsByExclusions(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })

  it('returns original when nothing excluded', () => {
    const ids = ['a', 'b']
    expect(filterTrackIdsByExclusions(ids, undefined)).toBe(ids)
    expect(filterTrackIdsByExclusions(ids, [])).toBe(ids)
  })
})
