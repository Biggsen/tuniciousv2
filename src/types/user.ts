import type { Timestamp } from 'firebase/firestore'

export interface UserSettings {
  musicbrainzUserAgent?: string
}

export interface LastfmConnection {
  sessionKey: string
  username: string
  connectedAt: Date
}

export interface LastfmConnectionDocument {
  sessionKey: string
  username: string
  connectedAt: Timestamp
}

export interface UserProfile {
  displayName: string
  email: string
  createdAt: Date
  settings: UserSettings
  lastfm?: LastfmConnection
}

export interface UserProfileDocument {
  displayName: string
  email: string
  createdAt: Timestamp
  settings: UserSettings
  lastfm?: LastfmConnectionDocument
}
