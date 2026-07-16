import { albumTitleMatchKeys } from '@/lib/import/normalizeAlbumTitle'
import { normalizeTrackTitle } from '@/lib/youtube/match'
import type { Album } from '@/types/library'
import type { V1MigrationAlbum, V1MigrationCandidate } from '@/types/v1Migration'

function artistsMatch(a: string, b: string): boolean {
  const left = normalizeTrackTitle(a)
  const right = normalizeTrackTitle(b)
  if (!left || !right) return false
  if (left === right) return true
  return left.includes(right) || right.includes(left)
}

function editionQualifierDiffers(v1Title: string, v2Title: string): boolean {
  const v1Keys = albumTitleMatchKeys(v1Title)
  const v2Keys = albumTitleMatchKeys(v2Title)
  const coreOverlap = v1Keys.some((key) => v2Keys.includes(key))
  if (!coreOverlap) return false
  const v1Full = normalizeTrackTitle(v1Title)
  const v2Full = normalizeTrackTitle(v2Title)
  return v1Full !== v2Full
}

function buildLibraryIndex(library: Album[]): Map<string, Album[]> {
  const index = new Map<string, Album[]>()
  for (const album of library) {
    for (const key of albumTitleMatchKeys(album.title)) {
      const matches = index.get(key) ?? []
      matches.push(album)
      index.set(key, matches)
    }
  }
  return index
}

function toCandidate(album: Album): V1MigrationCandidate {
  return {
    albumId: album.id,
    title: album.title,
    artist: album.artist,
    trackCount: album.tracks?.length ?? 0,
  }
}

export interface MatchDryRunResult {
  v1AlbumId: string
  status: 'suggested' | 'unmatched' | 'mapped'
  v2AlbumId?: string
  candidates: V1MigrationCandidate[]
  warning?: string
}

/** Suggest library matches for pending/unmatched/suggested staging albums. */
export function dryRunMatchV1Albums(
  stagingAlbums: V1MigrationAlbum[],
  library: Album[],
): MatchDryRunResult[] {
  const index = buildLibraryIndex(library)
  const results: MatchDryRunResult[] = []

  for (const album of stagingAlbums) {
    if (album.migration.status === 'mapped' || album.migration.status === 'applied') {
      continue
    }
    if (album.migration.status === 'skipped') continue

    const seen = new Set<string>()
    const candidates: Album[] = []
    for (const key of albumTitleMatchKeys(album.albumTitle)) {
      for (const candidate of index.get(key) ?? []) {
        if (seen.has(candidate.id)) continue
        if (!artistsMatch(album.artistName, candidate.artist)) continue
        seen.add(candidate.id)
        candidates.push(candidate)
      }
    }

    if (candidates.length === 0) {
      results.push({
        v1AlbumId: album.v1AlbumId,
        status: 'unmatched',
        candidates: [],
      })
      continue
    }

    if (candidates.length === 1) {
      const only = candidates[0]
      const warning = editionQualifierDiffers(album.albumTitle, only.title)
        ? 'Edition qualifiers differ between v1 and v2 titles — review before apply'
        : undefined
      results.push({
        v1AlbumId: album.v1AlbumId,
        status: warning ? 'suggested' : 'mapped',
        v2AlbumId: warning ? undefined : only.id,
        candidates: [toCandidate(only)],
        warning,
      })
      continue
    }

    results.push({
      v1AlbumId: album.v1AlbumId,
      status: 'suggested',
      candidates: candidates.map(toCandidate),
      warning: 'Multiple v2 candidates',
    })
  }

  return results
}
