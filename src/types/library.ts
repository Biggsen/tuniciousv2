import type { Timestamp } from 'firebase/firestore'

export interface Artist {
  id: string
  name: string
  sortName?: string
  artistMbid?: string
  scrobbleName?: string
  nameLower: string
  importedAt: Date
}

export interface ArtistDocument {
  id: string
  name: string
  sortName?: string
  artistMbid?: string
  scrobbleName?: string
  nameLower: string
  importedAt: Timestamp
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
  coverUrl?: string
  tracks: Track[]
  importedAt: Date
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
  coverUrl?: string
  tracks: Track[]
  importedAt: Timestamp
}

export interface AlbumImportInput {
  album: Omit<Album, 'importedAt'>
  artists: Omit<Artist, 'importedAt'>[]
}
