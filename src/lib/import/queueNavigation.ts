import type { StagedAlbum } from '@/lib/import/types'

export function firstPendingId(albumList: StagedAlbum[]): string | null {
  return albumList.find((album) => album.status === 'pending')?.id ?? null
}

export function nextPendingAfter(albumList: StagedAlbum[], albumUri: string): string | null {
  const startIndex = albumList.findIndex((album) => album.albumUri === albumUri)
  if (startIndex === -1) return firstPendingId(albumList)

  for (let i = startIndex + 1; i < albumList.length; i++) {
    if (albumList[i].status === 'pending') {
      return albumList[i].id
    }
  }

  return null
}
