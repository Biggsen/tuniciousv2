import type { Timestamp } from 'firebase/firestore'

export type YouTubeMappingSource = 'auto' | 'manual' | 'playlist'

export interface TrackYouTubeMapping {
  trackId: string
  videoId: string
  videoTitle: string
  channelTitle?: string
  durationMs?: number
  source: YouTubeMappingSource
  resolvedAt: Date
  searchQuery?: string
}

export interface TrackYouTubeMappingDocument {
  trackId: string
  videoId: string
  videoTitle: string
  channelTitle?: string
  durationMs?: number
  source: YouTubeMappingSource
  resolvedAt: Timestamp
  searchQuery?: string
}

export interface YouTubeVideoCandidate {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  durationMs?: number
  score?: number
}

export interface ArtistResolveContext {
  artistId: string
  artistDisplay: string
  preferredChannelId?: string
  preferredChannelTitle?: string
}

export interface YouTubePlaylistCandidate {
  playlistId: string
  title: string
  channelId: string
  channelTitle: string
  itemCount?: number
  score?: number
}
