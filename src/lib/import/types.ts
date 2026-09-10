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

export type StagedAlbumSource = 'csv' | 'v1'

/** Why a staged album was skipped during import. */
export type ImportSkipReason =
  | 'edition-not-listed'
  | 'artist-not-on-mb'
  | 'other'

export interface ImportSkipDetails {
  reason: ImportSkipReason
  note?: string
  /** Library album used instead of the export title (wrong edition / substitute). */
  libraryAlbumId?: string
}

export interface StagedAlbum {
  id: string
  albumUri: string
  albumName: string
  albumArtist: string
  releaseDate?: string
  imageUrl?: string
  /** When the album was added to the source playlist (Spotify Added At / v1 history). */
  addedAt?: string
  tracks: StagedTrack[]
  status: StagedAlbumStatus
  libraryAlbumId?: string
  source?: StagedAlbumSource
  skipReason?: ImportSkipReason
  skipNote?: string
}

export type TrackMatchQuality = 'exact' | 'partial' | 'mismatch' | 'missing-csv' | 'missing-mb'

export interface ComparedTrackRow {
  position: number
  csvTitle?: string
  mbTitle?: string
  match: TrackMatchQuality
}
