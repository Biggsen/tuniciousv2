import { hasCoverUrls, resolveAlbumCoverUrls } from '@/lib/album/coverArt'
import { listAlbums, updateAlbumCoverUrls } from '@/lib/album/firestore'

const COVER_FETCH_DELAY_MS = 300

export interface RefreshCoverUrlsResult {
  total: number
  updated: number
  unchanged: number
  noArt: number
  failed: number
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function coversMatch(
  album: { coverUrlSmall?: string; coverUrlLarge?: string },
  next: { small?: string; large?: string },
): boolean {
  return album.coverUrlSmall === next.small && album.coverUrlLarge === next.large
}

export async function refreshAlbumCoverUrls(uid: string): Promise<RefreshCoverUrlsResult> {
  const albums = await listAlbums(uid)
  const result: RefreshCoverUrlsResult = {
    total: albums.length,
    updated: 0,
    unchanged: 0,
    noArt: 0,
    failed: 0,
  }

  for (const [index, album] of albums.entries()) {
    try {
      const covers = await resolveAlbumCoverUrls({
        releaseMbid: album.releaseMbid,
        artist: album.artist,
        title: album.title,
      })

      if (!hasCoverUrls(covers)) {
        result.noArt++
      } else if (coversMatch(album, covers)) {
        result.unchanged++
      } else {
        await updateAlbumCoverUrls(uid, album.id, covers)
        result.updated++
      }
    } catch {
      result.failed++
    }

    if (index < albums.length - 1) {
      await delay(COVER_FETCH_DELAY_MS)
    }
  }

  return result
}
