import type { Album, PlaylistMember } from '@/types/library'
import type { PlaybackQueueItem } from '@/types/playback'
import type { TrackYouTubeMapping } from '@/types/youtube'

export function buildQueueFromAlbum(
  album: Album,
  mappings: Map<string, TrackYouTubeMapping> = new Map(),
  sourcePlaylistId?: string,
): PlaybackQueueItem[] {
  return album.tracks.map((track, index) => {
    const mapping = mappings.get(track.id)
    return {
      trackId: track.id,
      albumId: album.id,
      title: track.title,
      artist: album.artist,
      albumTitle: album.title,
      trackNumber: String(index + 1),
      lengthMs: track.lengthMs,
      videoId: mapping?.videoId ?? null,
      channelTitle: mapping?.channelTitle,
      channelId: mapping?.channelId,
      sourceType: sourcePlaylistId ? 'playlist' : 'album',
      sourcePlaylistId,
    }
  })
}

export function buildQueueFromPlaylist(
  members: PlaylistMember[],
  playlistId: string,
  mappings: Map<string, TrackYouTubeMapping> = new Map(),
): PlaybackQueueItem[] {
  const queue: PlaybackQueueItem[] = []

  for (const member of members) {
    queue.push(...buildQueueFromAlbum(member.album, mappings, playlistId))
  }

  return queue
}

export function shuffleResolvedQueueItems(items: PlaybackQueueItem[]): PlaybackQueueItem[] {
  const resolved = items.filter((item) => item.videoId)
  const shuffled = [...resolved]

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  return shuffled
}

/** Random index among items that already have a videoId, or -1 if none. */
export function pickRandomPlayableIndex(items: PlaybackQueueItem[]): number {
  const playable: number[] = []
  for (let index = 0; index < items.length; index++) {
    if (items[index]?.videoId) playable.push(index)
  }
  if (playable.length === 0) return -1
  return playable[Math.floor(Math.random() * playable.length)]!
}

/** True when playlist rows still look like album_picker stubs (ids only / no titles). */
export function playlistMembersNeedHydration(members: PlaylistMember[]): boolean {
  return members.some(
    (member) =>
      member.album.tracks.length === 0 ||
      member.album.tracks.some((track) => !track.title),
  )
}
