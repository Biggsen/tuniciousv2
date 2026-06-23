import { defineStore } from 'pinia'
import {
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
import type { UserProfile } from '@/types/user'

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
    signOutUser,
    refreshProfile,
  }
})
