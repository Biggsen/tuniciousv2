import type { StagedAlbum, StagedTrack } from '@/lib/import/types'

const EXPECTED_HEADERS = [
  'Track URI',
  'Track Name',
  'Artist URI(s)',
  'Artist Name(s)',
  'Album URI',
  'Album Name',
  'Album Artist URI(s)',
  'Album Artist Name(s)',
  'Album Release Date',
  'Album Image URL',
  'Disc Number',
  'Track Number',
  'Track Duration (ms)',
  'Track Preview URL',
  'Explicit',
  'Popularity',
  'ISRC',
  'Added By',
  'Added At',
] as const

type CsvRow = Record<(typeof EXPECTED_HEADERS)[number], string>

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      fields.push(current)
      current = ''
      continue
    }

    current += char
  }

  fields.push(current)
  return fields
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0])
  const headerIndex = new Map(headers.map((header, index) => [header, index]))

  const rows: CsvRow[] = []

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line)
    const row = {} as CsvRow

    for (const header of EXPECTED_HEADERS) {
      const index = headerIndex.get(header)
      row[header] = index === undefined ? '' : (values[index] ?? '')
    }

    if (row['Track URI'] || row['Album URI']) {
      rows.push(row)
    }
  }

  return rows
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function rowToTrack(row: CsvRow): StagedTrack {
  const duration = Number.parseInt(row['Track Duration (ms)'], 10)
  const isrc = row.ISRC.trim()

  return {
    trackUri: row['Track URI'].trim(),
    trackName: row['Track Name'].trim(),
    artistName: row['Artist Name(s)'].trim(),
    discNumber: parsePositiveInt(row['Disc Number'], 1),
    trackNumber: parsePositiveInt(row['Track Number'], 1),
    durationMs: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    isrc: isrc || undefined,
  }
}

function trackKey(track: StagedTrack): string {
  return track.trackUri || `${track.discNumber}-${track.trackNumber}-${track.trackName}`
}

function mergeTracks(existing: StagedTrack[], incoming: StagedTrack): StagedTrack[] {
  const key = trackKey(incoming)
  if (existing.some((track) => trackKey(track) === key)) {
    return existing
  }
  return [...existing, incoming]
}

function sortTracks(tracks: StagedTrack[]): StagedTrack[] {
  return [...tracks].sort(
    (a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber,
  )
}

export function parseSpotifyExportCsv(text: string): StagedAlbum[] {
  const rows = parseCsv(text)
  const albumsByUri = new Map<string, StagedAlbum>()

  for (const row of rows) {
    const albumUri = row['Album URI'].trim()
    if (!albumUri) continue

    const track = rowToTrack(row)
    const existing = albumsByUri.get(albumUri)

    if (existing) {
      existing.tracks = mergeTracks(existing.tracks, track)
      if (!existing.imageUrl && row['Album Image URL'].trim()) {
        existing.imageUrl = row['Album Image URL'].trim()
      }
      continue
    }

    albumsByUri.set(albumUri, {
      id: albumUri,
      albumUri,
      albumName: row['Album Name'].trim() || 'Unknown album',
      albumArtist: row['Album Artist Name(s)'].trim() || row['Artist Name(s)'].trim() || 'Unknown artist',
      releaseDate: row['Album Release Date'].trim() || undefined,
      imageUrl: row['Album Image URL'].trim() || undefined,
      tracks: [track],
      status: 'pending',
      source: 'csv',
    })
  }

  return [...albumsByUri.values()]
    .map((album) => ({ ...album, tracks: sortTracks(album.tracks) }))
    .sort((a, b) => a.albumArtist.localeCompare(b.albumArtist) || a.albumName.localeCompare(b.albumName))
}

export function mergeStagedAlbums(albums: StagedAlbum[]): StagedAlbum[] {
  const byUri = new Map<string, StagedAlbum>()

  for (const album of albums) {
    const existing = byUri.get(album.albumUri)
    if (!existing) {
      byUri.set(album.albumUri, { ...album, tracks: sortTracks([...album.tracks]) })
      continue
    }

    let tracks = [...existing.tracks]
    for (const track of album.tracks) {
      tracks = mergeTracks(tracks, track)
    }

    byUri.set(album.albumUri, {
      ...existing,
      tracks: sortTracks(tracks),
      imageUrl: existing.imageUrl ?? album.imageUrl,
      source: existing.source ?? album.source,
    })
  }

  return [...byUri.values()].sort(
    (a, b) => a.albumArtist.localeCompare(b.albumArtist) || a.albumName.localeCompare(b.albumName),
  )
}

export function getPrimaryIsrc(album: StagedAlbum): string | undefined {
  const trackOne = album.tracks.find((track) => track.discNumber === 1 && track.trackNumber === 1)
  if (trackOne?.isrc) return trackOne.isrc

  return album.tracks.find((track) => track.isrc)?.isrc
}
