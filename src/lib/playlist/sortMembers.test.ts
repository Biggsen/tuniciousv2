import { describe, expect, it } from 'vitest'

import { sortPlaylistMembers } from '@/lib/playlist/sortMembers'
import type { PlaylistMember } from '@/types/library'

function member(
  albumId: string,
  title: string,
  artist: string,
  year: string | undefined,
  addedAt: Date,
): PlaylistMember {
  return {
    membership: { albumId, addedAt, position: 0 },
    album: {
      id: albumId,
      title,
      artist,
      artistIds: [],
      artistId: 'artist-1',
      albumYear: year,
      releaseMbid: 'mbid',
      tracks: [],
      importedAt: addedAt,
    },
  }
}

describe('sortPlaylistMembers', () => {
  const members = [
    member('b', 'Beta', 'Zed', '2020', new Date('2024-02-01')),
    member('a', 'Alpha', 'Amy', '2019', new Date('2024-01-01')),
  ]

  it('sorts by title ascending', () => {
    const sorted = sortPlaylistMembers(members, 'title', true)
    expect(sorted.map((item) => item.album.id)).toEqual(['a', 'b'])
  })

  it('sorts by date added descending', () => {
    const sorted = sortPlaylistMembers(members, 'date-added', false)
    expect(sorted.map((item) => item.album.id)).toEqual(['b', 'a'])
  })
})
