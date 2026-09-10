import { fetchReleaseCoverUrls } from '@/lib/album/coverArt'
import {
  fetchWikidataImageUrls,
  imageUrlsFromResource,
  wikidataQidFromUrl,
} from '@/lib/artist/wikidataImage'
import {
  getArtist,
  getArtistWithUrlRels,
  getReleaseGroup,
  searchArtists,
} from '@/lib/musicbrainz/api'
import type { MbReleaseGroupRef, MbUrlRelation } from '@/lib/musicbrainz/types'
import { resolveMusicBrainzUserAgent } from '@/lib/musicbrainz/userAgent'

export interface ArtistImageUrls {
  small?: string
  large?: string
}

export interface ArtistImageSource {
  name: string
  artistMbid?: string
}

function hasImage(urls: ArtistImageUrls): boolean {
  return Boolean(urls.small || urls.large)
}

export function pickArtistImageSmall(artist: {
  imageUrlSmall?: string
  imageUrlLarge?: string
}): string | undefined {
  return artist.imageUrlSmall ?? artist.imageUrlLarge
}

export function pickArtistImageLarge(artist: {
  imageUrlSmall?: string
  imageUrlLarge?: string
}): string | undefined {
  return artist.imageUrlLarge ?? artist.imageUrlSmall
}

async function resolveArtistMbid(
  artist: ArtistImageSource,
  userAgent?: string,
): Promise<string | null> {
  if (artist.artistMbid) return artist.artistMbid

  const results = await searchArtists(artist.name, userAgent)
  if (!results.length) return null

  const normalized = artist.name.trim().toLowerCase()
  const exact = results.find((result) => result.name.trim().toLowerCase() === normalized)
  return exact?.id ?? results[0]?.id ?? null
}

function wikidataUrlFromRelations(relations: MbUrlRelation[] | undefined): string | null {
  if (!relations?.length) return null

  for (const relation of relations) {
    if (relation.type?.toLowerCase() !== 'wikidata') continue
    const resource = relation.url?.resource?.trim()
    if (resource) return resource
  }

  return null
}

function directImageFromRelations(relations: MbUrlRelation[] | undefined): ArtistImageUrls {
  if (!relations?.length) return {}

  for (const relation of relations) {
    const resource = relation.url?.resource?.trim()
    if (!resource) continue

    const type = relation.type?.toLowerCase()
    if (type === 'image' || type === 'logo') {
      const urls = imageUrlsFromResource(resource)
      if (urls) return urls
    }

    const commons = imageUrlsFromResource(resource)
    if (commons) return commons
  }

  return {}
}

function releaseGroupPriority(releaseGroup: MbReleaseGroupRef): number {
  switch (releaseGroup['primary-type']) {
    case 'Album':
      return 0
    case 'EP':
      return 1
    case 'Single':
      return 2
    default:
      return 3
  }
}

async function fetchReleaseCoverFallback(
  mbid: string,
  userAgent?: string,
): Promise<ArtistImageUrls> {
  const artist = await getArtist(mbid, userAgent)
  const releaseGroups = [...(artist['release-groups'] ?? [])].sort(
    (a, b) => releaseGroupPriority(a) - releaseGroupPriority(b),
  )

  for (const releaseGroup of releaseGroups.slice(0, 3)) {
    const detail = await getReleaseGroup(releaseGroup.id, userAgent)
    const release = detail.releases?.[0]
    if (!release?.id) continue

    const covers = await fetchReleaseCoverUrls(release.id)
    if (hasImage(covers)) {
      return { small: covers.small, large: covers.large }
    }
  }

  return {}
}

async function fetchWikidataImageFromRelations(
  relations: MbUrlRelation[] | undefined,
): Promise<ArtistImageUrls> {
  const wikidataUrl = wikidataUrlFromRelations(relations)
  if (!wikidataUrl) return {}

  const qid = wikidataQidFromUrl(wikidataUrl)
  if (!qid) return {}

  const urls = await fetchWikidataImageUrls(qid)
  if (hasImage(urls)) return urls

  return {}
}

export async function fetchArtistImageUrls(
  artist: ArtistImageSource,
  userAgent?: string,
): Promise<ArtistImageUrls> {
  const resolvedUserAgent = resolveMusicBrainzUserAgent(userAgent)

  try {
    const mbid = await resolveArtistMbid(artist, resolvedUserAgent)
    if (!mbid) return {}

    const withRelations = await getArtistWithUrlRels(mbid, resolvedUserAgent)
    const relations = withRelations.relations

    const direct = directImageFromRelations(relations)
    if (hasImage(direct)) return direct

    const wikidata = await fetchWikidataImageFromRelations(relations)
    if (hasImage(wikidata)) return wikidata

    return await fetchReleaseCoverFallback(mbid, resolvedUserAgent)
  } catch {
    return {}
  }
}

export function albumCoverFallback(url: string | undefined): ArtistImageUrls {
  if (!url) return {}
  return { small: url, large: url }
}
