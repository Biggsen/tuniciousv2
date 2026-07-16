import { describe, expect, it } from 'vitest'

import {
  defaultV1PlaylistId,
  listOpenPlaylistsFromV1Export,
  parseV1ExportAlbums,
  syncPlaylistHintFromV1Name,
  V1_NEW_QUEUED_PLAYLIST_ID,
  type V1ExportAlbum,
} from '@/lib/import/parseV1Export'

const QUEUED = V1_NEW_QUEUED_PLAYLIST_ID
const CURIOUS = '67lIAfdpjpYSvruBVFuP9N'

function album(
  id: string,
  title: string,
  artist: string,
  history: V1ExportAlbum['playlistHistory'],
): V1ExportAlbum {
  return {
    v1AlbumId: id,
    albumTitle: title,
    artistName: artist,
    releaseYear: '2017',
    albumCover: 'https://example.com/cover.jpg',
    playlistHistory: history,
  }
}

describe('parseV1ExportAlbums', () => {
  it('includes only open memberships on the target playlist', () => {
    const albums = [
      album('a1', 'Open Queued', 'Artist A', [
        { playlistId: QUEUED, playlistName: 'New Queued', removedAt: null },
      ]),
      album('a2', 'Left Queued', 'Artist B', [
        {
          playlistId: QUEUED,
          playlistName: 'New Queued',
          removedAt: '2026-01-01T00:00:00.000Z',
        },
        { playlistId: CURIOUS, playlistName: 'New Curious', removedAt: null },
      ]),
      album('a3', 'Never Queued', 'Artist C', [
        { playlistId: CURIOUS, playlistName: 'New Curious', removedAt: null },
      ]),
    ]

    const staged = parseV1ExportAlbums(albums, QUEUED)
    expect(staged).toHaveLength(1)
    expect(staged[0].albumName).toBe('Open Queued')
    expect(staged[0].albumUri).toBe('v1:a1')
    expect(staged[0].tracks).toEqual([])
    expect(staged[0].source).toBe('v1')
    expect(staged[0].releaseDate).toBe('2017')
  })

  it('returns empty when nothing is open on the playlist', () => {
    const albums = [
      album('a1', 'Closed', 'Artist', [
        { playlistId: QUEUED, removedAt: '2026-01-01T00:00:00.000Z' },
      ]),
    ]
    expect(parseV1ExportAlbums(albums, QUEUED)).toEqual([])
  })
})

describe('listOpenPlaylistsFromV1Export', () => {
  it('lists distinct open playlists with counts', () => {
    const albums = [
      album('a1', 'A', 'X', [
        { playlistId: QUEUED, playlistName: 'New Queued', removedAt: null },
      ]),
      album('a2', 'B', 'Y', [
        { playlistId: QUEUED, playlistName: 'New Queued', removedAt: null },
      ]),
      album('a3', 'C', 'Z', [
        { playlistId: CURIOUS, playlistName: 'New Curious', removedAt: null },
      ]),
      album('a4', 'D', 'W', [
        { playlistId: QUEUED, playlistName: 'New Queued', removedAt: '2026-01-01T00:00:00.000Z' },
      ]),
    ]

    const playlists = listOpenPlaylistsFromV1Export(albums)
    expect(playlists).toEqual([
      { playlistId: CURIOUS, playlistName: 'New Curious', albumCount: 1 },
      { playlistId: QUEUED, playlistName: 'New Queued', albumCount: 2 },
    ])
  })
})

describe('defaultV1PlaylistId', () => {
  it('prefers New Queued when present', () => {
    expect(
      defaultV1PlaylistId([
        { playlistId: CURIOUS, playlistName: 'New Curious', albumCount: 3 },
        { playlistId: QUEUED, playlistName: 'New Queued', albumCount: 5 },
      ]),
    ).toBe(QUEUED)
  })

  it('falls back to first playlist', () => {
    expect(
      defaultV1PlaylistId([{ playlistId: CURIOUS, playlistName: 'New Curious', albumCount: 1 }]),
    ).toBe(CURIOUS)
  })
})

describe('syncPlaylistHintFromV1Name', () => {
  it('strips New/Known prefix', () => {
    expect(syncPlaylistHintFromV1Name('New Queued')).toBe('Queued')
    expect(syncPlaylistHintFromV1Name('Known Curious')).toBe('Curious')
    expect(syncPlaylistHintFromV1Name('Queued')).toBe('Queued')
  })
})
