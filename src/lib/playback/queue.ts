import type { Album, PlaylistMember } from '@/types/library'
import type { PlaybackQueueItem } from '@/types/playback'

export function buildQueueFromAlbum(
  album: Album,
  sourcePlaylistId?: string,
): PlaybackQueueItem[] {
  return album.tracks.map((track) => ({
    trackId: track.id,
    albumId: album.id,
    title: track.title,
    artist: album.artist,
    albumTitle: album.title,
    trackNumber: track.trackNumber,
    lengthMs: track.lengthMs,
    videoId: null,
    sourceType: sourcePlaylistId ? 'playlist' : 'album',
    sourcePlaylistId,
  }))
}

export function buildQueueFromPlaylist(
  members: PlaylistMember[],
  playlistId: string,
): PlaybackQueueItem[] {
  const queue: PlaybackQueueItem[] = []

  for (const member of members) {
    queue.push(...buildQueueFromAlbum(member.album, playlistId))
  }

  return queue
}
