import type { Album, PlaylistMember } from '@/types/library'
import type { PlaybackQueueItem } from '@/types/playback'
import type { TrackYouTubeMapping } from '@/types/youtube'

export function buildQueueFromAlbum(
  album: Album,
  mappings: Map<string, TrackYouTubeMapping> = new Map(),
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
    videoId: mappings.get(track.id)?.videoId ?? null,
    sourceType: sourcePlaylistId ? 'playlist' : 'album',
    sourcePlaylistId,
  }))
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
