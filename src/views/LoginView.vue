<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { isFirebaseConfigured } from '@/lib/firebase'
import { formatAuthError, useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const mode = ref<'sign-in' | 'sign-up'>('sign-in')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const submitting = ref(false)

const creatingAccount = computed(() => mode.value === 'sign-up')
const passwordsMatch = computed(() => password.value === confirmPassword.value)
const passwordLongEnough = computed(() => password.value.length >= 6)
const canSubmitEmail = computed(() => {
  if (!isFirebaseConfigured() || submitting.value) return false
  if (!creatingAccount.value) return true
  return passwordLongEnough.value && passwordsMatch.value
})

function setMode(next: 'sign-in' | 'sign-up') {
  mode.value = next
  confirmPassword.value = ''
  showPassword.value = false
  showConfirmPassword.value = false
  auth.error = null
}

async function redirectAfterAuth() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  await router.replace(redirect)
}

function reportAuthError(err: unknown) {
  const message = formatAuthError(err)
  if (message) auth.error = message
}

async function handleGoogleSignIn() {
  submitting.value = true
  try {
    await auth.signInWithGoogle()
    await redirectAfterAuth()
  } catch (err) {
    reportAuthError(err)
  } finally {
    submitting.value = false
  }
}

async function handleEmailSubmit() {
  submitting.value = true
  try {
    if (creatingAccount.value) {
      await auth.signUpWithEmail(email.value, password.value)
    } else {
      await auth.signInWithEmail(email.value, password.value)
    }
    await redirectAfterAuth()
  } catch (err) {
    reportAuthError(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4">
    <div class="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-8 shadow-xl">
      <p class="text-sm font-medium uppercase tracking-wider text-accent">Tunicious v2</p>
      <h1 class="mt-2 text-2xl font-semibold">
        {{ creatingAccount ? 'Create your Tunicious account' : 'Sign in to Tunicious' }}
      </h1>
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

        <form class="space-y-3" @submit.prevent="handleEmailSubmit">
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="Email"
            class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              minlength="6"
              :autocomplete="creatingAccount ? 'new-password' : 'current-password'"
              placeholder="Password"
              class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 pr-10 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                class="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
                <path
                  v-if="showPassword"
                  stroke-linecap="round"
                  d="M4 20 20 4"
                />
              </svg>
            </button>
          </div>
          <div v-if="creatingAccount" class="relative">
            <input
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              required
              minlength="6"
              autocomplete="new-password"
              placeholder="Confirm password"
              class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 pr-10 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text"
              :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'"
              :aria-pressed="showConfirmPassword"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                class="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
                <path
                  v-if="showConfirmPassword"
                  stroke-linecap="round"
                  d="M4 20 20 4"
                />
              </svg>
            </button>
          </div>
          <p
            v-if="creatingAccount && password && !passwordLongEnough"
            class="text-xs text-text-muted"
          >
            Password must be at least 6 characters.
          </p>
          <p
            v-else-if="creatingAccount && confirmPassword && !passwordsMatch"
            class="text-xs text-text-muted"
          >
            Passwords do not match.
          </p>
          <button
            type="submit"
            class="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
            :disabled="!canSubmitEmail"
          >
            {{ creatingAccount ? 'Create account' : 'Sign in' }}
          </button>
        </form>

        <p class="text-center text-sm text-text-muted">
          <button
            v-if="creatingAccount"
            type="button"
            class="text-accent hover:underline"
            @click="setMode('sign-in')"
          >
            Already have an account? Sign in
          </button>
          <button
            v-else
            type="button"
            class="text-accent hover:underline"
            @click="setMode('sign-up')"
          >
            Create an account
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
