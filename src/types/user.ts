export interface UserSettings {
  musicbrainzUserAgent?: string
}

export interface UserProfile {
  displayName: string
  email: string
  createdAt: Date
  settings: UserSettings
}

export interface UserProfileDocument {
  displayName: string
  email: string
  createdAt: import('firebase/firestore').Timestamp
  settings: UserSettings
}
