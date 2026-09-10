import type { Album, AlbumEntry } from '@/types/library'

/** Merge per-user album_entry fields onto a catalog album (ratings + excluded tracks). */
export function applyAlbumEntryOverlay(
  album: Album,
  entry: AlbumEntry | null | undefined,
): Album {
  if (!entry) return album

  const excluded = new Set(entry.excludedTrackIds ?? [])
  return {
    ...album,
    tracks:
      excluded.size === 0
        ? album.tracks
        : album.tracks.filter((track) => !excluded.has(track.id)),
    rating: entry.rating,
    ratingSource: entry.ratingSource,
    ratingSubmittedPipelineId: entry.ratingSubmittedPipelineId,
    ratingBeforeSubmission: entry.ratingBeforeSubmission,
    ratedAt: entry.ratedAt,
  }
}

export function filterTrackIdsByExclusions(
  trackIds: string[],
  excludedTrackIds: string[] | undefined,
): string[] {
  if (!excludedTrackIds?.length) return trackIds
  const excluded = new Set(excludedTrackIds)
  return trackIds.filter((id) => !excluded.has(id))
}
