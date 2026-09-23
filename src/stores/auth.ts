import { FirebaseError } from 'firebase/app'
import { defineStore } from 'pinia'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { ref } from 'vue'

import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase'
import { ensureUserProfile, getUserProfile } from '@/lib/userProfile'
import { usePlaybackStore } from '@/stores/playback'
import { usePlayStatsStore } from '@/stores/playStats'
import type { UserProfile } from '@/types/user'

/** Short user-facing copy for Firebase Auth failures. Null means stay quiet. */
export function formatAuthError(err: unknown): string | null {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return null
      case 'auth/email-already-in-use':
        return 'That email already has an account.'
      case 'auth/invalid-email':
        return 'That email looks wrong.'
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.'
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email or password is wrong.'
      default:
        break
    }
  }

  return err instanceof Error ? err.message : 'Something went wrong. Try again.'
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const profile = ref<UserProfile | null>(null)
  const ready = ref(false)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  function init() {
    if (!isFirebaseConfigured()) {
      ready.value = true
      error.value = 'Firebase is not configured. See README for setup.'
      return
    }

    if (unsubscribe) {
      return
    }

    unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (nextUser) => {
      const previousUid = user.value?.uid ?? null
      if (previousUid && previousUid !== nextUser?.uid) {
        usePlaybackStore().releaseSession(previousUid)
      }

      user.value = nextUser
      error.value = null

      if (nextUser) {
        try {
          profile.value = await ensureUserProfile(nextUser)
        } catch (err) {
          error.value =
            err instanceof Error ? err.message : 'Failed to load user profile'
          profile.value = null
        }
      } else {
        profile.value = null
        usePlayStatsStore().reset()
      }

      ready.value = true
    })
  }

  async function signInWithGoogle() {
    error.value = null
    const provider = new GoogleAuthProvider()
    await signInWithPopup(getFirebaseAuth(), provider)
  }

  async function signInWithEmail(email: string, password: string) {
    error.value = null
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
  }

  async function signUpWithEmail(email: string, password: string) {
    error.value = null
    await createUserWithEmailAndPassword(getFirebaseAuth(), email, password)
  }

  async function signOutUser() {
    error.value = null
    await signOut(getFirebaseAuth())
  }

  async function refreshProfile() {
    if (!user.value) return
    profile.value = (await getUserProfile(user.value.uid)) ?? profile.value
  }

  return {
    user,
    profile,
    ready,
    error,
    init,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOutUser,
    refreshProfile,
  }
})
