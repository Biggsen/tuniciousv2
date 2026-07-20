import { describe, expect, it } from 'vitest'

import { findLibraryAlbumsByArtist, findLibraryMatch, markAlbumsInLibrary } from '@/lib/import/matchLibrary'
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

  it('lists library albums by staged artist', () => {
    const lib = [
      libraryAlbum('Mabool', 'Orphaned Land'),
      libraryAlbum('Unsung Prophets', 'Orphaned Land'),
      libraryAlbum('Other', 'Different Artist'),
    ]
    const staged = stagedAlbum('New Album', 'Orphaned Land')
    const matches = findLibraryAlbumsByArtist(staged, lib)
    expect(matches.map((album) => album.title)).toEqual(['Mabool', 'Unsung Prophets'])
  })

  it('matches And vs & in album titles', () => {
    const lib = [libraryAlbum('Unsung Prophets & Dead Messiahs', 'Orphaned Land')]
    const staged = stagedAlbum('Unsung Prophets And Dead Messiahs', 'Orphaned Land')
    expect(findLibraryMatch(staged, lib)?.id).toBe('Unsung Prophets & Dead Messiahs-id')
  })

  it('matches decorative parentheses in album titles', () => {
    const lib = [libraryAlbum('Sovereign Nose of (Y)our Arrogant Face', 'Scallops Hotel')]
    const staged = stagedAlbum('Sovereign Nose Of Your Arrogant Face', 'Scallops Hotel')
    expect(findLibraryMatch(staged, lib)?.id).toBe(
      'Sovereign Nose of (Y)our Arrogant Face-id',
    )
  })
})
