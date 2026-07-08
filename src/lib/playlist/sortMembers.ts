import type { PlaylistMember } from '@/types/library'

export type PlaylistSortField = 'date-added' | 'title' | 'artist' | 'year'

export function sortPlaylistMembers(
  members: PlaylistMember[],
  field: PlaylistSortField,
  ascending: boolean,
): PlaylistMember[] {
  const sorted = [...members].sort((left, right) => {
    switch (field) {
      case 'date-added':
        return left.membership.addedAt.getTime() - right.membership.addedAt.getTime()
      case 'title':
        return left.album.title.localeCompare(right.album.title)
      case 'artist':
        return left.album.artist.localeCompare(right.album.artist)
      case 'year':
        return (left.album.albumYear ?? '').localeCompare(right.album.albumYear ?? '')
    }
  })

  return ascending ? sorted : sorted.reverse()
}
