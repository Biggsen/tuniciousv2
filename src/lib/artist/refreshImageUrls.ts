import { fetchArtistImageUrls, type ArtistImageUrls } from '@/lib/artist/artistImage'
import { pickAlbumCoverSmall } from '@/lib/album/coverArt'
import { listAlbumsByArtist } from '@/lib/album/firestore'
import { listArtists } from '@/lib/artist/firestore'
import { setArtistImageUrls } from '@/lib/artist/imageStore'
import type { Artist } from '@/types/library'

const IMAGE_FETCH_DELAY_MS = 1000

export interface RefreshArtistImageUrlsResult {
  total: number
  updated: number
  unchanged: number
  noArt: number
  failed: number
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function imagesMatch(artist: Artist, next: ArtistImageUrls): boolean {
  return artist.imageUrlSmall === next.small && artist.imageUrlLarge === next.large
}

async function resolveArtistImageUrls(
  uid: string,
  artist: Artist,
  userAgent?: string,
): Promise<ArtistImageUrls> {
  let urls = await fetchArtistImageUrls(artist, userAgent)
  if (!urls.small && !urls.large) {
    const albums = await listAlbumsByArtist(uid, artist.id)
    const cover = albums.map((album) => pickAlbumCoverSmall(album)).find(Boolean)
    if (cover) urls = { small: cover, large: cover }
  }
  return urls
}

export async function refreshArtistImageUrls(
  uid: string,
  userAgent?: string,
): Promise<RefreshArtistImageUrlsResult> {
  const artists = await listArtists(uid)
  const result: RefreshArtistImageUrlsResult = {
    total: artists.length,
    updated: 0,
    unchanged: 0,
    noArt: 0,
    failed: 0,
  }

  for (const [index, artist] of artists.entries()) {
    try {
      const urls = await resolveArtistImageUrls(uid, artist, userAgent)

      if (!urls.small && !urls.large) {
        result.noArt++
      } else if (imagesMatch(artist, urls)) {
        result.unchanged++
      } else {
        await setArtistImageUrls(uid, artist.id, urls)
        result.updated++
      }
    } catch {
      result.failed++
    }

    if (index < artists.length - 1) {
      await delay(IMAGE_FETCH_DELAY_MS)
    }
  }

  return result
}
