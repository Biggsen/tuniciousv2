export interface StagedTrack {
  trackUri: string
  trackName: string
  artistName: string
  discNumber: number
  trackNumber: number
  durationMs?: number
  isrc?: string
}

export type StagedAlbumStatus = 'pending' | 'in-library' | 'imported' | 'skipped'

export interface StagedAlbum {
  id: string
  albumUri: string
  albumName: string
  albumArtist: string
  releaseDate?: string
  imageUrl?: string
  tracks: StagedTrack[]
  status: StagedAlbumStatus
  libraryAlbumId?: string
}

export type TrackMatchQuality = 'exact' | 'partial' | 'mismatch' | 'missing-csv' | 'missing-mb'

export interface ComparedTrackRow {
  position: number
  csvTitle?: string
  mbTitle?: string
  match: TrackMatchQuality
}
