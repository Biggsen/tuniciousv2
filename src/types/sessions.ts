import type { Timestamp } from 'firebase/firestore'

export type ListenEndReason =
  | 'completed'
  | 'skipped'
  | 'stopped'
  | 'queue_cleared'
  | 'error'

export type PlaybackSourceType = 'album' | 'playlist'

export interface PlaybackSession {
  id: string
  albumId: string
  albumTitle: string
  artist: string
  sourceType: PlaybackSourceType
  sourcePlaylistId?: string
  startedAt: Date
  endedAt?: Date
}

export interface PlaybackSessionDocument {
  id: string
  albumId: string
  albumTitle: string
  artist: string
  sourceType: PlaybackSourceType
  sourcePlaylistId?: string
  startedAt: Timestamp
  endedAt?: Timestamp
}

export interface TrackListenRecord {
  id: string
  playbackSessionId: string
  trackId: string
  albumId: string
  title: string
  artist: string
  albumTitle: string
  videoId: string
  trackLengthMs?: number
  sourcePlaylistId?: string
  startedAt: Date
  endedAt: Date
  listenedMs: number
  completed: boolean
  endReason: ListenEndReason
  scrobbled?: boolean
}

export interface TrackListenRecordDocument {
  id: string
  playbackSessionId: string
  trackId: string
  albumId: string
  title: string
  artist: string
  albumTitle: string
  videoId: string
  trackLengthMs?: number
  sourcePlaylistId?: string
  startedAt: Timestamp
  endedAt: Timestamp
  listenedMs: number
  completed: boolean
  endReason: ListenEndReason
  scrobbled?: boolean
}

export interface TrackPlayStats {
  trackId: string
  playcount: number
  lastPlayedAt?: Date
  lastSyncedAt?: Date
  lastfmPlaycountAtSync?: number
}

export interface TrackPlayStatsDocument {
  trackId: string
  playcount: number
  lastPlayedAt?: Timestamp
  lastSyncedAt?: Timestamp
  lastfmPlaycountAtSync?: number
}
