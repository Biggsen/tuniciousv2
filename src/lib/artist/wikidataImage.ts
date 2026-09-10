import type { ArtistImageUrls } from '@/lib/artist/artistImage'

interface WikidataClaimsResponse {
  claims?: {
    P18?: {
      mainsnak?: {
        datavalue?: {
          value?: string
        }
      }
    }[]
  }
}

export function wikidataQidFromUrl(url: string): string | null {
  const match = url.match(/wikidata\.org\/wiki\/(Q\d+)/i)
  return match?.[1] ?? null
}

export function commonsImageUrls(filename: string): ArtistImageUrls {
  const normalized = filename.trim().replace(/ /g, '_')
  const encoded = encodeURIComponent(normalized)
  const base = `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encoded}`
  return {
    small: `${base}?width=256`,
    large: `${base}?width=1024`,
  }
}

export function imageUrlsFromResource(resource: string): ArtistImageUrls | null {
  const trimmed = resource.trim()
  if (!trimmed) return null

  if (trimmed.includes('upload.wikimedia.org') || trimmed.includes('commons.wikimedia.org')) {
    const withWidth = (width: number) => {
      if (trimmed.includes('width=')) return trimmed
      const joiner = trimmed.includes('?') ? '&' : '?'
      return `${trimmed}${joiner}width=${width}`
    }
    return {
      small: withWidth(256),
      large: withWidth(1024),
    }
  }

  return null
}

export async function fetchWikidataImageUrls(qid: string): Promise<ArtistImageUrls> {
  const params = new URLSearchParams({
    action: 'wbgetclaims',
    entity: qid,
    property: 'P18',
    format: 'json',
    origin: '*',
  })

  try {
    const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`)
    if (!response.ok) return {}

    const data = (await response.json()) as WikidataClaimsResponse
    const filename = data.claims?.P18?.[0]?.mainsnak?.datavalue?.value
    if (!filename) return {}

    return commonsImageUrls(filename)
  } catch {
    return {}
  }
}
