import type { YouTubeMappingSource } from '@/types/youtube'

export interface PlaybackQueueItem {
  trackId: string
  albumId: string
  title: string
  artist: string
  albumTitle: string
  trackNumber: string
  lengthMs?: number
  videoId: string | null
  channelTitle?: string
  channelId?: string
  /** Where the saved video came from. Manual picks are not replaced at playback. */
  mappingSource?: YouTubeMappingSource
  sourceType: 'album' | 'playlist'
  sourcePlaylistId?: string
}

export interface PlaybackAudition {
  videoId: string
  title: string
  channelTitle: string
  trackId: string
  libraryTitle: string
}
