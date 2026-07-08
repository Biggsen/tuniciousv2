import type { ComparedTrackRow } from '@/lib/import/types'
import type { StagedTrack } from '@/lib/import/types'
import { normalizeTrackTitle } from '@/lib/youtube/match'
import type { MbTrack } from '@/lib/musicbrainz/types'

const FUZZY_MAX_EDITS = 2
const FUZZY_MAX_RATIO = 0.2

function normalizeForCompare(title: string): string {
  return normalizeTrackTitle(title)
    .replace(/\s+bonus track$/, '')
    .replace(/\s+demo$/, '')
    .trim()
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const rows = a.length + 1
  const cols = b.length + 1
  const matrix: number[] = new Array(cols)

  for (let col = 0; col < cols; col++) matrix[col] = col

  for (let row = 1; row < rows; row++) {
    let prev = row
    for (let col = 1; col < cols; col++) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1
      const next = Math.min(
        matrix[col] + 1,
        prev + 1,
        matrix[col - 1] + cost,
      )
      matrix[col - 1] = prev
      prev = next
    }
    matrix[cols - 1] = prev
  }

  return matrix[cols - 1]
}

function isFuzzyTitleMatch(csvNorm: string, mbNorm: string): boolean {
  const maxLen = Math.max(csvNorm.length, mbNorm.length)
  if (!maxLen) return false

  const distance = levenshteinDistance(csvNorm, mbNorm)
  return distance <= FUZZY_MAX_EDITS && distance / maxLen <= FUZZY_MAX_RATIO
}

function titleMatchQuality(csvTitle: string, mbTitle: string): ComparedTrackRow['match'] {
  const csvNorm = normalizeForCompare(csvTitle)
  const mbNorm = normalizeForCompare(mbTitle)

  if (!csvNorm || !mbNorm) return 'partial'
  if (csvNorm === mbNorm) return 'exact'
  if (csvNorm.includes(mbNorm) || mbNorm.includes(csvNorm)) return 'partial'
  if (isFuzzyTitleMatch(csvNorm, mbNorm)) return 'partial'
  return 'mismatch'
}

export function compareTracklists(
  csvTracks: StagedTrack[],
  mbTracks: MbTrack[],
): ComparedTrackRow[] {
  const sortedCsv = [...csvTracks].sort(
    (a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber,
  )
  const sortedMb = [...mbTracks]

  const maxLen = Math.max(sortedCsv.length, sortedMb.length)
  const rows: ComparedTrackRow[] = []

  for (let index = 0; index < maxLen; index++) {
    const csv = sortedCsv[index]
    const mb = sortedMb[index]

    if (csv && mb) {
      rows.push({
        position: index + 1,
        csvTitle: csv.trackName,
        mbTitle: mb.title,
        match: titleMatchQuality(csv.trackName, mb.title),
      })
    } else if (csv) {
      rows.push({
        position: index + 1,
        csvTitle: csv.trackName,
        match: 'missing-mb',
      })
    } else if (mb) {
      rows.push({
        position: index + 1,
        mbTitle: mb.title,
        match: 'missing-csv',
      })
    }
  }

  return rows
}

export function tracklistMatchScore(rows: ComparedTrackRow[]): number {
  if (!rows.length) return 0

  let score = 0
  for (const row of rows) {
    if (row.match === 'exact') score += 2
    else if (row.match === 'partial') score += 1
  }

  const penalty = rows.filter((row) => row.match === 'missing-csv' || row.match === 'missing-mb').length
  return score - penalty
}

export function tracklistMatchPercent(rows: ComparedTrackRow[]): number {
  if (!rows.length) return 0
  const matched = rows.filter((row) => row.match === 'exact' || row.match === 'partial').length
  return Math.round((matched / rows.length) * 100)
}

export function isTracklistFullyAlignedByPosition(rows: ComparedTrackRow[]): boolean {
  return rows.length > 0 && tracklistMatchPercent(rows) === 100
}
