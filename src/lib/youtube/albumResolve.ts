import type { Album } from '@/types/library'
import type { TrackYouTubeMapping } from '@/types/youtube'

export type AlbumResolveStatus = 'resolved' | 'partial' | 'unresolved'

export function countAlbumResolvedTracks(
  album: Pick<Album, 'tracks'>,
  mappings: Map<string, TrackYouTubeMapping>,
): { resolved: number; total: number } {
  const total = album.tracks.length
  const resolved = album.tracks.filter((track) => mappings.has(track.id)).length
  return { resolved, total }
}

export function albumResolveStatus(
  album: Pick<Album, 'tracks'>,
  mappings: Map<string, TrackYouTubeMapping>,
): AlbumResolveStatus {
  const { resolved, total } = countAlbumResolvedTracks(album, mappings)
  if (total === 0 || resolved === 0) return 'unresolved'
  if (resolved === total) return 'resolved'
  return 'partial'
}

export function albumResolveCardClasses(status: AlbumResolveStatus): string {
  switch (status) {
    case 'resolved':
      return 'border-border bg-surface-raised/50 hover:border-accent/40'
    case 'partial':
      return 'border-amber-500/25 bg-amber-500/[0.07] hover:border-amber-500/40'
    default:
      return 'border-red-500/20 bg-red-500/[0.06] hover:border-red-500/35'
  }
}

export function albumLibraryCardClasses(status: AlbumResolveStatus, isPlaying: boolean): string {
  if (isPlaying) {
    return 'border-accent/50 bg-accent/10 hover:border-accent/70'
  }
  return albumResolveCardClasses(status)
}
