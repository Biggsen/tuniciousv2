<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { isFirebaseConfigured } from '@/lib/firebase'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const submitting = ref(false)

async function handleGoogleSignIn() {
  submitting.value = true
  try {
    await auth.signInWithGoogle()
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (err) {
    auth.error = err instanceof Error ? err.message : 'Google sign-in failed'
  } finally {
    submitting.value = false
  }
}

async function handleEmailSignIn() {
  submitting.value = true
  try {
    await auth.signInWithEmail(email.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (err) {
    auth.error = err instanceof Error ? err.message : 'Email sign-in failed'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4">
    <div class="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-8 shadow-xl">
      <p class="text-sm font-medium uppercase tracking-wider text-accent">Phase 0</p>
      <h1 class="mt-2 text-2xl font-semibold">Sign in to Tunicious</h1>
      <p class="mt-2 text-sm text-text-muted">
        Personal music player — MusicBrainz, YouTube, Last.fm.
      </p>

      <div
        v-if="!isFirebaseConfigured()"
        class="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        Firebase is not configured. Copy <code class="text-xs">.env.example</code> to
        <code class="text-xs">.env</code> and add your project credentials.
      </div>

      <p v-if="auth.error" class="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
        {{ auth.error }}
      </p>

      <div class="mt-6 space-y-4">
        <button
          type="button"
          class="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
          :disabled="submitting || !isFirebaseConfigured()"
          @click="handleGoogleSignIn"
        >
          Continue with Google
        </button>

        <div class="relative py-2 text-center text-xs text-text-muted">
          <span class="bg-surface-raised px-2">or email</span>
        </div>

        <form class="space-y-3" @submit.prevent="handleEmailSignIn">
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="Email"
            class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <input
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            placeholder="Password"
            class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            class="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
            :disabled="submitting || !isFirebaseConfigured()"
          >
            Sign in
          </button>
        </form>
      </div>

      <p class="mt-6 text-xs leading-relaxed text-text-muted">
        Enable Email/Password and Google sign-in in the Firebase console. Create test users there
        for email login.
      </p>
    </div>
  </div>
</template>
