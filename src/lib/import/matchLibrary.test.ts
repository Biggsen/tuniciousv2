import { describe, expect, it } from 'vitest'

import { findLibraryMatch, markAlbumsInLibrary } from '@/lib/import/matchLibrary'
import type { StagedAlbum } from '@/lib/import/types'
import type { Album } from '@/types/library'

function libraryAlbum(title: string, artist: string): Album {
  return {
    id: `${title}-id`,
    title,
    artist,
    artistId: 'artist-1',
    artistIds: [],
    tracks: [],
    releaseMbid: 'mbid',
    importedAt: new Date(),
  }
}

function stagedAlbum(name: string, artist: string): StagedAlbum {
  return {
    id: `spotify:album:${name}`,
    albumUri: `spotify:album:${name}`,
    albumName: name,
    albumArtist: artist,
    tracks: [],
    status: 'pending',
  }
}

describe('matchLibrary', () => {
  const library = [libraryAlbum('Fang Island', 'Fang Island')]

  it('matches csv deluxe titles to the base library album', () => {
    const staged = stagedAlbum('Fang Island (Deluxe Edition)', 'Fang Island')
    expect(findLibraryMatch(staged, library)?.id).toBe('Fang Island-id')
  })

  it('marks staged albums as in-library during csv load', () => {
    const staged = stagedAlbum('Fang Island (Deluxe Edition)', 'Fang Island')
    const marked = markAlbumsInLibrary([staged], library)
    expect(marked[0]?.status).toBe('in-library')
    expect(marked[0]?.libraryAlbumId).toBe('Fang Island-id')
  })
})
