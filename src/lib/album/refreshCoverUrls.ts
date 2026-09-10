import { deleteField, doc, updateDoc } from 'firebase/firestore'

import { fetchReleaseCoverUrls } from '@/lib/album/coverArt'
import { listAlbums, upsertAlbumPickerItem } from '@/lib/album/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'

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
    if (!album.releaseMbid) {
      result.failed++
      continue
    }

    try {
      const covers = await fetchReleaseCoverUrls(album.releaseMbid)

      if (!covers.small && !covers.large) {
        result.noArt++
      } else if (coversMatch(album, covers)) {
        result.unchanged++
      } else {
        const ref = doc(getFirestoreDb(), 'albums', album.id)
        await updateDoc(
          ref,
          omitUndefined({
            coverUrlSmall: covers.small,
            coverUrlLarge: covers.large,
            coverUrl: deleteField(),
          }),
        )
        await upsertAlbumPickerItem(uid, {
          ...album,
          coverUrlSmall: covers.small,
        })
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
