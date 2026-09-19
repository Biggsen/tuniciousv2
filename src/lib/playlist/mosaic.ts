import { pickAlbumCoverSmall } from '@/lib/album/coverArt'

export const PLAYLIST_MOSAIC_SIZE = 4

export function playlistMosaicCoverUrls(
  albums: Array<{ coverUrlSmall?: string; coverUrlLarge?: string }>,
  limit = PLAYLIST_MOSAIC_SIZE,
): string[] {
  if (albums.length === 0) return []
  if (albums.length < limit) {
    const cover = pickAlbumCoverSmall(albums[0])
    return cover ? [cover] : []
  }

  return albums.slice(0, limit).map((album) => pickAlbumCoverSmall(album) ?? '')
}
