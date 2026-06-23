export interface PlaybackQueueItem {
  trackId: string
  albumId: string
  title: string
  artist: string
  albumTitle: string
  trackNumber: string
  lengthMs?: number
  videoId: string | null
  sourceType: 'album' | 'playlist'
  sourcePlaylistId?: string
}
