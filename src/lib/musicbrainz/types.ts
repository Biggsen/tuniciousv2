export interface MbArtistRef {
  id: string
  name: string
  'sort-name'?: string
}

export interface MbReleaseGroupRef {
  id: string
  title: string
  'primary-type'?: string
  'first-release-date'?: string
  'secondary-types'?: string[]
}

export interface MbReleaseRef {
  id: string
  title: string
  date?: string
  country?: string
  status?: string
}

export interface MbRecording {
  id: string
  title: string
  length?: number
}

export interface MbMedium {
  position: number
  format?: string
  'track-count'?: number
  tracks?: MbTrack[]
}

export interface MbTrack {
  id: string
  number: string
  title: string
  length?: number
  recording?: MbRecording
}

export interface MbArtistCredit {
  name: string
  artist: MbArtistRef
  joinphrase?: string
}

export interface MbArtistSearchResult {
  id: string
  name: string
  'sort-name'?: string
  disambiguation?: string
  country?: string
  type?: string
}

export interface MbReleaseGroupSearchResult {
  id: string
  title: string
  'primary-type'?: string
  'first-release-date'?: string
  disambiguation?: string
  'artist-credit'?: MbArtistCredit[]
}

export interface MbArtistDetail extends MbArtistSearchResult {
  'release-groups'?: MbReleaseGroupRef[]
}

export interface MbReleaseGroupDetail extends MbReleaseGroupSearchResult {
  releases?: MbReleaseRef[]
}

export interface MbReleaseDetail extends MbReleaseRef {
  'artist-credit'?: MbArtistCredit[]
  'release-group'?: MbReleaseGroupRef
  media?: MbMedium[]
}

export interface MbSearchResponse<T> {
  artists?: T[]
  'release-groups'?: T[]
  'artist-count'?: number
  'release-group-count'?: number
  offset?: number
  count?: number
}
