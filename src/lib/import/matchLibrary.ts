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

export function findLibraryMatch(album: StagedAlbum, library: Album[]): Album | null {
  const titleNorm = normalizeForMatch(album.albumName)
  if (!titleNorm) return null

  for (const candidate of library) {
    const candidateTitle = normalizeForMatch(candidate.title)
    if (candidateTitle !== titleNorm) continue
    if (artistsMatch(album.albumArtist, candidate.artist)) {
      return candidate
    }
  }

  return null
}

export function markAlbumsInLibrary(staged: StagedAlbum[], library: Album[]): StagedAlbum[] {
  return staged.map((album) => {
    if (album.status !== 'pending') return album

    const match = findLibraryMatch(album, library)
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
