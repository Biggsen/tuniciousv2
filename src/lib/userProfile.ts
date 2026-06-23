import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'

import { getFirestoreDb } from '@/lib/firebase'
import type { UserProfile, UserProfileDocument, UserSettings } from '@/types/user'

function toUserProfile(data: UserProfileDocument): UserProfile {
  return {
    displayName: data.displayName,
    email: data.email,
    createdAt: data.createdAt.toDate(),
    settings: data.settings ?? {},
  }
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const ref = doc(getFirestoreDb(), 'users', user.uid)
  const snapshot = await getDoc(ref)

  if (snapshot.exists()) {
    return toUserProfile(snapshot.data() as UserProfileDocument)
  }

  const profile: Omit<UserProfileDocument, 'createdAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>
  } = {
    displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Listener',
    email: user.email ?? '',
    createdAt: serverTimestamp(),
    settings: {},
  }

  await setDoc(ref, profile)

  const created = await getDoc(ref)
  const createdAt = created.data()?.createdAt as Timestamp | undefined

  return {
    displayName: profile.displayName,
    email: profile.email,
    createdAt: createdAt?.toDate() ?? new Date(),
    settings: profile.settings,
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(getFirestoreDb(), 'users', uid)
  const snapshot = await getDoc(ref)

  if (!snapshot.exists()) {
    return null
  }

  return toUserProfile(snapshot.data() as UserProfileDocument)
}

export async function updateUserSettings(
  uid: string,
  settings: Partial<UserSettings>,
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid)
  const payload: Record<string, string> = {}

  if ('musicbrainzUserAgent' in settings) {
    payload['settings.musicbrainzUserAgent'] = settings.musicbrainzUserAgent?.trim() ?? ''
  }

  await updateDoc(ref, payload)
}
