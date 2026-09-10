import {
  albumCoverFallback,
  fetchArtistImageUrls,
  type ArtistImageUrls,
} from '@/lib/artist/artistImage'
import { pickAlbumCoverSmall } from '@/lib/album/coverArt'
import { listAlbumsByArtist } from '@/lib/album/firestore'
import { setArtistImageUrls, clearArtistImageUrls } from '@/lib/artist/imageStore'
import type { Artist } from '@/types/library'

const IMAGE_FETCH_DELAY_MS = 1000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function imagesMatch(artist: Artist, next: ArtistImageUrls): boolean {
  return artist.imageUrlSmall === next.small && artist.imageUrlLarge === next.large
}

function artistNeedsImage(artist: Artist): boolean {
  return !artist.imageUrlSmall && !artist.imageUrlLarge
}

async function libraryAlbumCoverFallback(
  uid: string,
  artistId: string,
): Promise<ArtistImageUrls> {
  const albums = await listAlbumsByArtist(uid, artistId)
  const cover = albums.map((album) => pickAlbumCoverSmall(album)).find(Boolean)
  return albumCoverFallback(cover)
}

async function resolveArtistImageUrls(
  uid: string,
  artist: Artist,
  userAgent?: string,
): Promise<ArtistImageUrls> {
  let urls = await fetchArtistImageUrls(artist, userAgent)
  if (!urls.small && !urls.large) {
    urls = await libraryAlbumCoverFallback(uid, artist.id)
  }
  return urls
}

export async function syncArtistImage(
  uid: string,
  artist: Artist,
  options?: { clearIfMissing?: boolean; userAgent?: string },
): Promise<ArtistImageUrls> {
  const urls = await resolveArtistImageUrls(uid, artist, options?.userAgent)

  if (!urls.small && !urls.large) {
    if (options?.clearIfMissing && (artist.imageUrlSmall || artist.imageUrlLarge)) {
      await clearArtistImageUrls(uid, artist.id)
    }
    return urls
  }

  if (!imagesMatch(artist, urls)) {
    await setArtistImageUrls(uid, artist.id, urls)
  }

  return urls
}

export async function ensureArtistImages(
  uid: string,
  artists: Artist[],
  userAgent?: string,
): Promise<void> {
  const pending = artists.filter(artistNeedsImage)
  if (!pending.length) return

  for (const [index, artist] of pending.entries()) {
    try {
      await syncArtistImage(uid, artist, { userAgent })
    } catch {
      // Best-effort during import.
    }

    if (index < pending.length - 1) {
      await delay(IMAGE_FETCH_DELAY_MS)
    }
  }
}
