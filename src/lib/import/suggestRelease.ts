import type { StagedAlbum } from '@/lib/import/types'
import type { MbReleaseRef } from '@/lib/musicbrainz/types'
import { normalizeTrackTitle } from '@/lib/youtube/match'

function normalizeAlbumTitle(title: string): string {
  return normalizeTrackTitle(title)
}

function titleSimilarity(a: string, b: string): number {
  const normA = normalizeAlbumTitle(a)
  const normB = normalizeAlbumTitle(b)
  if (!normA || !normB) return 0
  if (normA === normB) return 100
  if (normA.includes(normB) || normB.includes(normA)) return 70
  return 0
}

function artistSimilarity(csvArtist: string, credits: MbReleaseRef['artist-credit']): number {
  if (!credits?.length) return 0
  const creditNames = credits.map((credit) => normalizeAlbumTitle(credit.name))
  const csvNorm = normalizeAlbumTitle(csvArtist)
  if (!csvNorm) return 0

  for (const name of creditNames) {
    if (name === csvNorm) return 100
    if (name.includes(csvNorm) || csvNorm.includes(name)) return 70
  }

  return 0
}

function releaseYear(date: string | undefined): number | undefined {
  if (!date) return undefined
  const match = date.match(/^(\d{4})/)
  return match ? Number.parseInt(match[1], 10) : undefined
}

function yearProximityScore(csvDate: string | undefined, mbDate: string | undefined): number {
  const csvYear = releaseYear(csvDate)
  const mbYear = releaseYear(mbDate)
  if (!csvYear || !mbYear) return 0
  const diff = Math.abs(csvYear - mbYear)
  if (diff === 0) return 30
  if (diff === 1) return 15
  if (diff <= 3) return 5
  return 0
}

function scoreRelease(release: MbReleaseRef, album: StagedAlbum): number {
  const rgTitle = release['release-group']?.title ?? release.title
  let score = titleSimilarity(album.albumName, rgTitle)
  score += titleSimilarity(album.albumName, release.title) * 0.5
  score += artistSimilarity(album.albumArtist, release['artist-credit']) * 0.4
  score += yearProximityScore(album.releaseDate, release.date)

  if (release.status === 'Official') score += 10

  const secondaryTypes = release['release-group']?.['secondary-types'] ?? []
  const primaryType = release['release-group']?.['primary-type']
  if (primaryType === 'Album') score += 5
  if (secondaryTypes.includes('Compilation')) score -= 25

  return score
}

const MIN_MATCH_SCORE = 40

const PREFERRED_COUNTRY_ORDER = ['XW', 'XE'] as const

function pickBestInTier(
  releases: MbReleaseRef[],
  album: StagedAlbum,
  country?: string,
): { release: MbReleaseRef; score: number } | null {
  let best: MbReleaseRef | null = null
  let bestScore = -1

  for (const release of releases) {
    if (country !== undefined && release.country !== country) continue

    const releaseScore = scoreRelease(release, album)
    if (releaseScore > bestScore) {
      best = release
      bestScore = releaseScore
    }
  }

  if (!best || bestScore < MIN_MATCH_SCORE) return null
  return { release: best, score: bestScore }
}

export function pickBestRelease(
  releases: MbReleaseRef[],
  album: StagedAlbum,
): MbReleaseRef | null {
  if (!releases.length) return null

  for (const country of PREFERRED_COUNTRY_ORDER) {
    const match = pickBestInTier(releases, album, country)
    if (match) return match.release
  }

  return pickBestInTier(releases, album)?.release ?? null
}
