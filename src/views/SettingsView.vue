<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import PlaceholderPage from '@/components/PlaceholderPage.vue'
import {
  completeLastfmConnect,
  connectLastfm,
  disconnectLastfm,
  getPendingLastfmAuthToken,
} from '@/lib/lastfm/auth'
import { refreshLibraryPlaycounts } from '@/lib/lastfm/scrobble'
import { getDefaultMusicBrainzUserAgent } from '@/lib/musicbrainz/userAgent'
import { updateUserSettings } from '@/lib/userProfile'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const musicbrainzUserAgent = ref('')
const saving = ref(false)
const saved = ref(false)
const saveError = ref<string | null>(null)

const lastfmConnecting = ref(false)
const lastfmDisconnecting = ref(false)
const lastfmSyncing = ref(false)
const lastfmError = ref<string | null>(null)
const lastfmMessage = ref<string | null>(null)
const pendingLastfmToken = ref<string | null>(null)

const lastfmConnected = computed(() => Boolean(auth.profile?.lastfm?.username))

watch(
  () => auth.profile?.settings.musicbrainzUserAgent,
  (value) => {
    musicbrainzUserAgent.value = value ?? ''
  },
  { immediate: true },
)

async function saveMusicBrainzUserAgent() {
  if (!auth.user) return

  saving.value = true
  saved.value = false
  saveError.value = null

  try {
    await updateUserSettings(auth.user.uid, {
      musicbrainzUserAgent: musicbrainzUserAgent.value,
    })
    await auth.refreshProfile()
    saved.value = true
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to save settings'
  } finally {
    saving.value = false
  }
}

async function handleConnectLastfm() {
  if (!auth.user) return

  lastfmConnecting.value = true
  lastfmError.value = null
  lastfmMessage.value = null
  pendingLastfmToken.value = null

  try {
    const result = await connectLastfm(auth.user.uid)
    pendingLastfmToken.value = null
    await auth.refreshProfile()
    lastfmMessage.value = `Connected as ${result.username}`
  } catch (err) {
    pendingLastfmToken.value = getPendingLastfmAuthToken()
    lastfmError.value = err instanceof Error ? err.message : 'Failed to connect Last.fm'
  } finally {
    lastfmConnecting.value = false
  }
}

async function handleFinishLastfmLogin() {
  if (!auth.user || !pendingLastfmToken.value) return

  lastfmConnecting.value = true
  lastfmError.value = null
  lastfmMessage.value = null

  try {
    const result = await completeLastfmConnect(auth.user.uid, pendingLastfmToken.value)
    pendingLastfmToken.value = null
    await auth.refreshProfile()
    lastfmMessage.value = `Connected as ${result.username}`
  } catch (err) {
    lastfmError.value = err instanceof Error ? err.message : 'Failed to finish Last.fm login'
  } finally {
    lastfmConnecting.value = false
  }
}

async function handleDisconnectLastfm() {
  if (!auth.user) return
  if (!confirm('Disconnect Last.fm? Scrobbling will stop.')) return

  lastfmDisconnecting.value = true
  lastfmError.value = null
  lastfmMessage.value = null

  try {
    await disconnectLastfm(auth.user.uid)
    await auth.refreshProfile()
    lastfmMessage.value = 'Last.fm disconnected'
  } catch (err) {
    lastfmError.value = err instanceof Error ? err.message : 'Failed to disconnect Last.fm'
  } finally {
    lastfmDisconnecting.value = false
  }
}

async function handleRefreshPlaycounts() {
  if (!auth.user) return

  lastfmSyncing.value = true
  lastfmError.value = null
  lastfmMessage.value = null

  try {
    const synced = await refreshLibraryPlaycounts(auth.user.uid)
    lastfmMessage.value = `Synced playcounts for ${synced} tracks`
  } catch (err) {
    lastfmError.value = err instanceof Error ? err.message : 'Failed to refresh playcounts'
  } finally {
    lastfmSyncing.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-8">
    <PlaceholderPage
      title="Account"
      description="Signed-in user details."
    >
      <dl class="mt-4 space-y-3 text-sm">
        <div>
          <dt class="text-text-muted">Display name</dt>
          <dd>{{ auth.profile?.displayName ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-text-muted">Email</dt>
          <dd>{{ auth.profile?.email ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-text-muted">User ID</dt>
          <dd class="break-all font-mono text-xs">{{ auth.user?.uid ?? '—' }}</dd>
        </div>
      </dl>
    </PlaceholderPage>

    <section class="rounded-xl border border-border bg-surface-raised/50 p-6">
      <h2 class="text-lg font-medium">Last.fm</h2>
      <p class="mt-2 text-sm text-text-muted">
        Connect to scrobble listens and sync playcounts. Last.fm is authoritative when you refresh
        playcounts.
      </p>

      <p v-if="lastfmConnected" class="mt-4 text-sm">
        Connected as
        <span class="font-medium text-accent">{{ auth.profile?.lastfm?.username }}</span>
      </p>
      <p v-else class="mt-4 text-sm text-text-muted">Not connected</p>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button
          v-if="!lastfmConnected"
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
          :disabled="lastfmConnecting"
          @click="handleConnectLastfm"
        >
          {{ lastfmConnecting ? 'Connecting…' : 'Connect Last.fm' }}
        </button>
        <button
          v-else
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
          :disabled="lastfmDisconnecting"
          @click="handleDisconnectLastfm"
        >
          {{ lastfmDisconnecting ? 'Disconnecting…' : 'Disconnect' }}
        </button>
        <button
          v-if="lastfmConnected"
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
          :disabled="lastfmSyncing"
          @click="handleRefreshPlaycounts"
        >
          {{ lastfmSyncing ? 'Syncing…' : 'Refresh playcounts' }}
        </button>
        <button
          v-if="pendingLastfmToken && !lastfmConnected"
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
          :disabled="lastfmConnecting"
          @click="handleFinishLastfmLogin"
        >
          Finish login
        </button>
      </div>

      <p v-if="lastfmMessage" class="mt-3 text-sm text-emerald-400">{{ lastfmMessage }}</p>
      <p v-if="lastfmError" class="mt-3 text-sm text-red-300">{{ lastfmError }}</p>
    </section>

    <section class="rounded-xl border border-border bg-surface-raised/50 p-6">
      <h2 class="text-lg font-medium">MusicBrainz</h2>
      <p class="mt-2 text-sm text-text-muted">
        MusicBrainz requires a descriptive User-Agent (app name + contact email).
        Leave blank to use the app default.
      </p>

      <label class="mt-4 block text-sm">
        <span class="text-text-muted">User-Agent override</span>
        <input
          v-model="musicbrainzUserAgent"
          type="text"
          :placeholder="getDefaultMusicBrainzUserAgent()"
          class="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </label>

      <p class="mt-2 text-xs text-text-muted">
        Default: {{ getDefaultMusicBrainzUserAgent() }}
      </p>

      <div class="mt-4 flex items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
          :disabled="saving"
          @click="saveMusicBrainzUserAgent"
        >
          Save
        </button>
        <span v-if="saved" class="text-sm text-emerald-400">Saved</span>
        <span v-if="saveError" class="text-sm text-red-300">{{ saveError }}</span>
      </div>
    </section>
  </div>
</template>
