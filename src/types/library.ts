import type { Timestamp } from 'firebase/firestore'

import type { RatingSource, StarRating } from '@/types/pipeline'

export interface Artist {
  id: string
  name: string
  sortName?: string
  artistMbid?: string
  scrobbleName?: string
  nameLower: string
  imageUrlSmall?: string
  imageUrlLarge?: string
  preferredYouTubeChannelId?: string
  preferredYouTubeChannelTitle?: string
  importedAt: Date
  importedBy?: string
}

export interface ArtistDocument {
  id: string
  name: string
  sortName?: string
  artistMbid?: string
  scrobbleName?: string
  nameLower: string
  imageUrlSmall?: string
  imageUrlLarge?: string
  preferredYouTubeChannelId?: string
  preferredYouTubeChannelTitle?: string
  importedAt: Timestamp
  importedBy?: string
}

export interface Track {
  id: string
  trackNumber: string
  title: string
  lengthMs?: number
}

export interface Album {
  id: string
  title: string
  artistIds: string[]
  artistId: string
  artist: string
  albumYear?: string
  type?: string
  releaseMbid: string
  coverUrlSmall?: string
  coverUrlLarge?: string
  tracks: Track[]
  youtubePlaylistId?: string
  youtubePlaylistTitle?: string
  rating?: StarRating
  ratingSource?: RatingSource
  ratingSubmittedPipelineId?: string
  ratingBeforeSubmission?: StarRating
  ratedAt?: Date
  importedAt: Date
  importedBy?: string
}

export interface AlbumDocument {
  id: string
  title: string
  artistIds: string[]
  artistId: string
  artist: string
  albumYear?: string
  type?: string
  releaseMbid: string
  coverUrlSmall?: string
  coverUrlLarge?: string
  /** @deprecated Legacy single cover field — read for migration only */
  coverUrl?: string
  tracks: Track[]
  youtubePlaylistId?: string
  youtubePlaylistTitle?: string
  rating?: StarRating
  ratingSource?: RatingSource
  ratingSubmittedPipelineId?: string
  ratingBeforeSubmission?: StarRating
  ratedAt?: Timestamp
  importedAt: Timestamp
  importedBy?: string
}

/** Per-user relationship and state for a canonical album. */
export interface AlbumEntry {
  albumId: string
  createdAt: Date
  updatedAt: Date
  excludedTrackIds?: string[]
  rating?: StarRating
  ratingSource?: RatingSource
  ratingSubmittedPipelineId?: string
  ratingBeforeSubmission?: StarRating
  ratedAt?: Date
}

export interface AlbumEntryDocument {
  albumId: string
  createdAt: Timestamp
  updatedAt: Timestamp
  excludedTrackIds?: string[]
  rating?: StarRating
  ratingSource?: RatingSource
  ratingSubmittedPipelineId?: string
  ratingBeforeSubmission?: StarRating
  ratedAt?: Timestamp
}

/** Per-user preferences for a canonical artist. */
export interface ArtistPrefs {
  artistId: string
  scrobbleName?: string
  preferredYouTubeChannelId?: string
  preferredYouTubeChannelTitle?: string
}

export interface ArtistPrefsDocument {
  artistId: string
  scrobbleName?: string
  preferredYouTubeChannelId?: string
  preferredYouTubeChannelTitle?: string
}

export interface AlbumImportInput {
  album: Omit<Album, 'importedAt' | 'importedBy'>
  artists: Omit<Artist, 'importedAt' | 'importedBy'>[]
}

export interface Playlist {
  id: string
  name: string
  description?: string
  pipelineId?: string
  createdAt: Date
  updatedAt: Date
}

export interface PlaylistDocument {
  id: string
  name: string
  description?: string
  pipelineId?: string
  createdAt: import('firebase/firestore').Timestamp
  updatedAt: import('firebase/firestore').Timestamp
}

export interface PlaylistMembership {
  albumId: string
  addedAt: Date
  position: number
}

export interface PlaylistMembershipDocument {
  albumId: string
  addedAt: import('firebase/firestore').Timestamp
  position: number
}

export interface PlaylistMember {
  membership: PlaylistMembership
  album: Album
}
