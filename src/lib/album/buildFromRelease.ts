import { yearFromDate, formatReleaseGroupType } from '@/lib/musicbrainz/format'
import { formatAlbumArtistDisplay } from '@/lib/artist/seedFromCredits'
import type { Artist, Track } from '@/types/library'
import type { MbReleaseDetail } from '@/lib/musicbrainz/types'

export interface BuiltAlbum {
  title: string
  artistIds: string[]
  artistId: string
  artist: string
  albumYear?: string
  type?: string
  releaseMbid: string
  tracks: Track[]
}

export function buildTracksFromRelease(release: MbReleaseDetail): Track[] {
  if (!release.media?.length) return []

  return release.media.flatMap((medium) =>
    (medium.tracks ?? []).map((track) => ({
      id: crypto.randomUUID(),
      trackNumber: track.number,
      title: track.title,
      lengthMs: track.length ?? track.recording?.length,
    })),
  )
}

export function buildAlbumFromRelease(
  release: MbReleaseDetail,
  artists: Artist[],
): BuiltAlbum {
  const artistIds = artists.map((a) => a.id)
  const artistDisplay = formatAlbumArtistDisplay(release['artist-credit'])
  const releaseGroup = release['release-group']

  return {
    title: release.title,
    artistIds,
    artistId: artistIds[0] ?? '',
    artist: artistDisplay,
    albumYear: yearFromDate(releaseGroup?.['first-release-date']),
    type: formatReleaseGroupType(releaseGroup?.['primary-type']) || undefined,
    releaseMbid: release.id,
    tracks: buildTracksFromRelease(release),
  }
}
