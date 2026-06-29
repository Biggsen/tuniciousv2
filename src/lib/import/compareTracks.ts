import type { ComparedTrackRow } from '@/lib/import/types'
import type { StagedTrack } from '@/lib/import/types'
import { normalizeTrackTitle } from '@/lib/youtube/match'
import type { MbTrack } from '@/lib/musicbrainz/types'

function titleMatchQuality(csvTitle: string, mbTitle: string): ComparedTrackRow['match'] {
  const csvNorm = normalizeTrackTitle(csvTitle)
  const mbNorm = normalizeTrackTitle(mbTitle)

  if (!csvNorm || !mbNorm) return 'partial'
  if (csvNorm === mbNorm) return 'exact'
  if (csvNorm.includes(mbNorm) || mbNorm.includes(csvNorm)) return 'partial'
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
