import { albumTitleMatchKeys } from '@/lib/import/normalizeAlbumTitle'
import { normalizeTrackTitle } from '@/lib/youtube/match'

const COVER_ART_ARCHIVE = 'https://coverartarchive.org'
const ITUNES_SEARCH = 'https://itunes.apple.com/search'

export interface ReleaseCoverUrls {
  small?: string
  large?: string
}

export interface ItunesAlbumResult {
  artistName?: string
  collectionName?: string
  artworkUrl60?: string
  artworkUrl100?: string
}

export function pickAlbumCoverSmall(album: {
  coverUrlSmall?: string
  coverUrlLarge?: string
}): string | undefined {
  return album.coverUrlSmall ?? album.coverUrlLarge
}

export function pickAlbumCoverLarge(album: {
  coverUrlSmall?: string
  coverUrlLarge?: string
}): string | undefined {
  return album.coverUrlLarge ?? album.coverUrlSmall
}

export function hasCoverUrls(covers: ReleaseCoverUrls): boolean {
  return Boolean(covers.small || covers.large)
}

export function coverUrlsFromManualUrl(raw: string): ReleaseCoverUrls {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Enter an image URL')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Enter a valid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must start with http or https')
  }

  return { small: parsed.href, large: parsed.href }
}

export function itunesArtworkUrl(url: string, size: number): string {
  return url.replace(/(\d+)x(\d+)(bb)?/i, (_match, _w, _h, bb: string | undefined) => {
    return `${size}x${size}${bb ?? ''}`
  })
}

function coversFromItunesArtwork(url: string): ReleaseCoverUrls {
  return {
    small: itunesArtworkUrl(url, 400),
    large: itunesArtworkUrl(url, 1200),
  }
}

function albumNamesMatch(left: string, right: string): boolean {
  const keys = new Set(albumTitleMatchKeys(left))
  return albumTitleMatchKeys(right).some((key) => keys.has(key))
}

/** Split a joined credit like "Baron / De Looze / Verheyen" into searchable names. */
export function itunesSearchArtistNames(...credits: Array<string | undefined>): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const credit of credits) {
    if (!credit?.trim()) continue
    for (const part of credit.split(/\s*\/\s*|\s*,\s*|\s+&\s+|\s+and\s+/i)) {
      const name = part.trim()
      const key = normalizeTrackTitle(name)
      if (!name || !key || seen.has(key)) continue
      seen.add(key)
      names.push(name)
    }
  }
  return names
}

function artistNamesMatch(
  credited: string,
  itunesArtist: string,
  extraArtists: string[] = [],
): boolean {
  const itunes = normalizeTrackTitle(itunesArtist)
  if (!itunes) return false
  return itunesSearchArtistNames(credited, ...extraArtists).some((name) => {
    const ours = normalizeTrackTitle(name)
    if (!ours) return false
    return itunes === ours || itunes.includes(ours) || ours.includes(itunes)
  })
}

export function pickItunesAlbumCover(
  results: ItunesAlbumResult[],
  artist: string,
  title: string,
  extraArtists: string[] = [],
): ReleaseCoverUrls {
  const match = results.find(
    (result) =>
      result.collectionName &&
      result.artistName &&
      albumNamesMatch(title, result.collectionName) &&
      artistNamesMatch(artist, result.artistName, extraArtists),
  )
  const artwork = match?.artworkUrl100 ?? match?.artworkUrl60
  if (!artwork) return {}
  return coversFromItunesArtwork(artwork)
}

export async function fetchReleaseCoverUrls(releaseMbid: string): Promise<ReleaseCoverUrls> {
  try {
    const response = await fetch(`${COVER_ART_ARCHIVE}/release/${releaseMbid}`, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      return {}
    }

    const data = (await response.json()) as {
      images?: { front?: boolean; thumbnails?: { small?: string; large?: string } }[]
    }

    const front = data.images?.find((image) => image.front)
    return {
      small: front?.thumbnails?.small,
      large: front?.thumbnails?.large,
    }
  } catch {
    return {}
  }
}

export async function fetchItunesAlbumCoverUrls(
  artist: string,
  title: string,
  extraArtists: string[] = [],
): Promise<ReleaseCoverUrls> {
  const queries: string[] = []
  const seen = new Set<string>()
  const push = (term: string) => {
    const trimmed = term.replace(/\s+/g, ' ').trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) return
    seen.add(key)
    queries.push(trimmed)
  }

  for (const name of itunesSearchArtistNames(...extraArtists, artist)) {
    push(`${name} ${title}`)
  }
  push(`${artist} ${title}`)
  push(title)

  if (queries.length === 0) return {}

  try {
    for (const term of queries) {
      const url = `${ITUNES_SEARCH}?term=${encodeURIComponent(term)}&media=music&entity=album&limit=5`
      const response = await fetch(url)
      if (!response.ok) continue
      const data = (await response.json()) as { results?: ItunesAlbumResult[] }
      const covers = pickItunesAlbumCover(data.results ?? [], artist, title, extraArtists)
      if (hasCoverUrls(covers)) return covers
    }
    return {}
  } catch {
    return {}
  }
}

export async function resolveAlbumCoverUrls(input: {
  releaseMbid?: string
  artist: string
  title: string
  extraArtists?: string[]
}): Promise<ReleaseCoverUrls> {
  if (input.releaseMbid) {
    const caa = await fetchReleaseCoverUrls(input.releaseMbid)
    if (hasCoverUrls(caa)) return caa
  }

  return fetchItunesAlbumCoverUrls(input.artist, input.title, input.extraArtists)
}
