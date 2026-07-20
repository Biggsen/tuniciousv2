import { albumTitleMatchKeys } from '@/lib/import/normalizeAlbumTitle'
import type { StagedAlbum } from '@/lib/import/types'
import { normalizeTrackTitle } from '@/lib/youtube/match'
import type { Album } from '@/types/library'

function normalizeForMatch(text: string): string {
  return normalizeTrackTitle(text)
}

function artistsMatch(csvArtist: string, libraryArtist: string): boolean {
  const csvNorm = normalizeForMatch(csvArtist)
  const libNorm = normalizeForMatch(libraryArtist)
  if (!csvNorm || !libNorm) return false
  if (csvNorm === libNorm) return true
  return csvNorm.includes(libNorm) || libNorm.includes(csvNorm)
}

function buildLibraryIndex(library: Album[]): Map<string, Album[]> {
  const index = new Map<string, Album[]>()

  for (const candidate of library) {
    for (const key of albumTitleMatchKeys(candidate.title)) {
      const matches = index.get(key) ?? []
      matches.push(candidate)
      index.set(key, matches)
    }
  }

  return index
}

function findMatchInIndex(
  album: StagedAlbum,
  index: Map<string, Album[]>,
): Album | null {
  for (const key of albumTitleMatchKeys(album.albumName)) {
    for (const candidate of index.get(key) ?? []) {
      if (artistsMatch(album.albumArtist, candidate.artist)) {
        return candidate
      }
    }
  }

  return null
}

export function findLibraryMatch(album: StagedAlbum, library: Album[]): Album | null {
  return findMatchInIndex(album, buildLibraryIndex(library))
}

/** All library albums whose artist matches the staged import row (fuzzy). */
export function findLibraryAlbumsByArtist(
  album: StagedAlbum,
  library: Album[],
): Album[] {
  return library
    .filter((candidate) => artistsMatch(album.albumArtist, candidate.artist))
    .sort((a, b) => {
      const yearA = a.albumYear ?? ''
      const yearB = b.albumYear ?? ''
      if (yearA !== yearB) return yearB.localeCompare(yearA)
      return a.title.localeCompare(b.title)
    })
}

export function markAlbumsInLibrary(staged: StagedAlbum[], library: Album[]): StagedAlbum[] {
  const index = buildLibraryIndex(library)

  return staged.map((album) => {
    if (album.status !== 'pending') return album

    const match = findMatchInIndex(album, index)
    if (!match) return album

    return {
      ...album,
      status: 'in-library',
      libraryAlbumId: match.id,
    }
  })
}

export function isStagedAlbumResolved(album: StagedAlbum): boolean {
  return album.status === 'imported' || album.status === 'in-library'
}
