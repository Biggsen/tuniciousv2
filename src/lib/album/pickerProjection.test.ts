import { describe, expect, it } from 'vitest'

import {
  buildAlbumPickerItemFromAlbum,
  mergeAlbumPickerMatches,
  normalizeAlbumPickerText,
  tokenizeAlbumPickerText,
  type AlbumPickerItem,
} from '@/lib/album/firestore'
import type { Album } from '@/types/library'

function makeAlbum(overrides: Partial<Album> & Pick<Album, 'id' | 'title' | 'artist'>): Album {
  return {
    ...overrides,
    id: overrides.id,
    title: overrides.title,
    artist: overrides.artist,
    artistId: 'artist-1',
    artistIds: ['artist-1'],
    releaseMbid: `release-${overrides.id}`,
    tracks: [],
    importedAt: new Date('2026-01-01T00:00:00.000Z'),
  }
}

function makePickerItem(
  overrides: Partial<AlbumPickerItem> & Pick<AlbumPickerItem, 'id' | 'title' | 'artist'>,
): AlbumPickerItem {
  return {
    id: overrides.id,
    title: overrides.title,
    artist: overrides.artist,
    titleLower: overrides.titleLower ?? overrides.title.toLowerCase(),
    artistLower: overrides.artistLower ?? overrides.artist.toLowerCase(),
    albumYear: overrides.albumYear,
    coverUrlSmall: overrides.coverUrlSmall,
    importedAt: overrides.importedAt,
  }
}

describe('normalizeAlbumPickerText', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeAlbumPickerText('  The Mars Volta  ')).toBe('the mars volta')
  })
})

describe('tokenizeAlbumPickerText', () => {
  it('splits terms into lowercase deduped word tokens', () => {
    expect(tokenizeAlbumPickerText(' Mr. Finish-Line ')).toEqual(['mr', 'finish', 'line'])
  })
})

describe('buildAlbumPickerItemFromAlbum', () => {
  it('projects only lightweight picker fields', () => {
    const album = makeAlbum({
      id: 'a1',
      title: 'Frances the Mute',
      artist: 'The Mars Volta',
      albumYear: '2005',
      coverUrlSmall: 'https://example.com/cover.jpg',
    })

    const projection = buildAlbumPickerItemFromAlbum(album)
    expect(projection).toMatchObject({
      id: 'a1',
      title: 'Frances the Mute',
      artist: 'The Mars Volta',
      albumYear: '2005',
      coverUrlSmall: 'https://example.com/cover.jpg',
      titleLower: 'frances the mute',
      artistLower: 'the mars volta',
      titleTokens: ['frances', 'the', 'mute'],
      artistTokens: ['the', 'mars', 'volta'],
    })
    expect(projection).not.toHaveProperty('tracks')
  })
})

describe('mergeAlbumPickerMatches', () => {
  it('deduplicates and sorts merged title/artist matches', () => {
    const titleMatches = [
      makePickerItem({ id: '2', title: 'Crack the Skye', artist: 'Mastodon' }),
      makePickerItem({ id: '1', title: 'Blood Mountain', artist: 'Mastodon' }),
    ]
    const artistMatches = [
      makePickerItem({ id: '2', title: 'Crack the Skye', artist: 'Mastodon' }),
      makePickerItem({ id: '3', title: 'Leviathan', artist: 'Mastodon' }),
    ]

    const merged = mergeAlbumPickerMatches(titleMatches, artistMatches, 10)
    expect(merged.map((item) => item.id)).toEqual(['1', '2', '3'])
  })
})
