import { describe, expect, it } from 'vitest'

import { albumBelongsToGroup, filterAlbumsForGroup } from '@/lib/migrate/v1MigrationFirestore'
import type { V1MigrationAlbum, V1PlaylistIdMap } from '@/types/v1Migration'

function album(
  id: string,
  history: V1MigrationAlbum['playlistHistory'],
): V1MigrationAlbum {
  return {
    v1AlbumId: id,
    albumTitle: id,
    artistName: 'Artist',
    playlistHistory: history,
    migration: { status: 'pending' },
  }
}

describe('albumBelongsToGroup', () => {
  it('matches by history type or playlist id', () => {
    const spotifyIds = new Set(['pl-known-1'])
    expect(
      albumBelongsToGroup(
        album('a', [{ playlistId: 'x', addedAt: '', removedAt: null, type: 'known' }]),
        'known',
        spotifyIds,
      ),
    ).toBe(true)
    expect(
      albumBelongsToGroup(
        album('b', [{ playlistId: 'pl-known-1', addedAt: '', removedAt: null }]),
        'known',
        spotifyIds,
      ),
    ).toBe(true)
    expect(
      albumBelongsToGroup(
        album('c', [{ playlistId: 'pl-new-1', addedAt: '', removedAt: null, type: 'new' }]),
        'known',
        spotifyIds,
      ),
    ).toBe(false)
  })
})

describe('filterAlbumsForGroup', () => {
  it('keeps only albums for the selected funnel map', () => {
    const map = {
      group: 'known',
      stages: { 'pl-known-1': {} },
    } as unknown as V1PlaylistIdMap
    const albums = [
      album('new-only', [{ playlistId: 'pl-new', addedAt: '', removedAt: null, type: 'new' }]),
      album('known-only', [
        { playlistId: 'pl-known-1', addedAt: '', removedAt: null, type: 'known' },
      ]),
    ]
    expect(filterAlbumsForGroup(albums, 'known', map).map((row) => row.v1AlbumId)).toEqual([
      'known-only',
    ])
  })
})
