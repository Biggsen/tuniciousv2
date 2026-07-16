import type { Album } from '@/types/library'
import type { TrackYouTubeMapping } from '@/types/youtube'

export type AlbumResolveStatus = 'resolved' | 'partial' | 'unresolved'

type AlbumResolveInput =
  | Pick<Album, 'tracks'>
  | { trackIds: string[] }

type MappingLookup = Map<string, TrackYouTubeMapping> | Set<string>

function trackIdsFromAlbum(album: AlbumResolveInput): string[] {
  return 'trackIds' in album ? album.trackIds : album.tracks.map((track) => track.id)
}

function hasMapping(mappings: MappingLookup, trackId: string): boolean {
  return mappings.has(trackId)
}

export function countAlbumResolvedTracks(
  album: AlbumResolveInput,
  mappings: MappingLookup,
): { resolved: number; total: number } {
  const trackIds = trackIdsFromAlbum(album)
  const total = trackIds.length
  const resolved = trackIds.filter((trackId) => hasMapping(mappings, trackId)).length
  return { resolved, total }
}

export function albumResolveStatus(
  album: AlbumResolveInput,
  mappings: MappingLookup,
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
