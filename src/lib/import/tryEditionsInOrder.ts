import { compareTracklists, isTracklistFullyAlignedByPosition } from '@/lib/import/compareTracks'
import { pickBestRelease } from '@/lib/import/suggestRelease'
import type { StagedAlbum } from '@/lib/import/types'
import type { MbReleaseDetail, MbReleaseRef } from '@/lib/musicbrainz/types'

export const MAX_EDITION_ATTEMPTS = 3

export function editionsToTry(
  releases: MbReleaseRef[],
  album: StagedAlbum,
  maxAttempts = MAX_EDITION_ATTEMPTS,
): MbReleaseRef[] {
  if (maxAttempts < 1 || !releases.length) return []

  const seen = new Set<string>()
  const ordered: MbReleaseRef[] = []

  function add(candidate: MbReleaseRef | null | undefined) {
    if (!candidate || seen.has(candidate.id)) return
    seen.add(candidate.id)
    ordered.push(candidate)
  }

  add(pickBestRelease(releases, album))

  for (const release of releases) {
    add(release)
  }

  return ordered.slice(0, maxAttempts)
}

export function isReleaseAlignedWithAlbum(album: StagedAlbum, release: MbReleaseDetail): boolean {
  const mbTracks = release.media?.flatMap((medium) => medium.tracks ?? []) ?? []
  const rows = compareTracklists(album.tracks, mbTracks)
  return isTracklistFullyAlignedByPosition(rows)
}
