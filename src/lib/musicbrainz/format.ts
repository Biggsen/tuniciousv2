import type { MbArtistCredit } from '@/lib/musicbrainz/types'

export function formatArtistCredit(credits: MbArtistCredit[] | undefined): string {
  if (!credits?.length) return 'Unknown artist'
  return credits
    .map((credit, index) => {
      const join = index < credits.length - 1 ? (credit.joinphrase ?? '') : ''
      return `${credit.name}${join}`
    })
    .join('')
}

export function yearFromDate(date: string | undefined): string | undefined {
  if (!date) return undefined
  const match = date.match(/^(\d{4})/)
  return match?.[1]
}

export function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return '—'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatReleaseGroupType(primaryType: string | undefined): string {
  if (!primaryType) return ''
  return primaryType.toLowerCase()
}

export function formatCountry(country: string | undefined): string {
  if (!country) return '—'
  return country.toUpperCase()
}

/** Short label for a specific release when RG title is often identical. */
export function formatReleaseEditionLabel(
  release: { title: string; date?: string; country?: string; status?: string },
  releaseGroupTitle?: string,
): string {
  const parts: string[] = []
  if (release.date) parts.push(release.date)
  if (release.country) parts.push(formatCountry(release.country))
  if (release.status && release.status !== 'Official') parts.push(release.status)

  if (parts.length) return parts.join(' · ')

  if (releaseGroupTitle && release.title !== releaseGroupTitle) {
    return release.title
  }

  return 'This edition'
}
