<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import {
  completeLastfmConnect,
  connectLastfm,
  disconnectLastfm,
  getPendingLastfmAuthToken,
} from '@/lib/lastfm/auth'
import { refreshLibraryPlaycounts } from '@/lib/lastfm/scrobble'
import { refreshAlbumCoverUrls } from '@/lib/album/refreshCoverUrls'
import { refreshArtistImageUrls } from '@/lib/artist/refreshImageUrls'
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

const coverRefreshing = ref(false)
const coverMessage = ref<string | null>(null)
const coverError = ref<string | null>(null)

const artistImageRefreshing = ref(false)
const artistImageMessage = ref<string | null>(null)
const artistImageError = ref<string | null>(null)

const lastfmConnected = computed(() => Boolean(auth.profile?.lastfm?.username))

const memberSince = computed(() => {
  const date = auth.profile?.createdAt
  return date ? date.toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'
})

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

async function handleRefreshCoverUrls() {
  if (!auth.user) return
  if (!confirm('Re-fetch cover art for all library albums? This may take a minute.')) return

  coverRefreshing.value = true
  coverError.value = null
  coverMessage.value = null

  try {
    const result = await refreshAlbumCoverUrls(auth.user.uid)
    coverMessage.value = `Updated ${result.updated} covers · ${result.unchanged} unchanged · ${result.noArt} without art · ${result.failed} failed`
  } catch (err) {
    coverError.value = err instanceof Error ? err.message : 'Failed to refresh cover art'
  } finally {
    coverRefreshing.value = false
  }
}

async function handleRefreshArtistImages() {
  if (!auth.user) return
  if (!confirm('Re-fetch artist photos from MusicBrainz / Wikidata? This may take several minutes.')) {
    return
  }

  artistImageRefreshing.value = true
  artistImageMessage.value = null
  artistImageError.value = null

  try {
    const result = await refreshArtistImageUrls(
      auth.user.uid,
      musicbrainzUserAgent.value || undefined,
    )
    artistImageMessage.value = `Updated ${result.updated} photos · ${result.unchanged} unchanged · ${result.noArt} without art · ${result.failed} failed`
  } catch (err) {
    artistImageError.value = err instanceof Error ? err.message : 'Failed to refresh artist photos'
  } finally {
    artistImageRefreshing.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <section class="rounded-xl border border-border bg-surface-raised/50 p-6">
      <h2 class="text-lg font-medium">Account</h2>
      <p class="mt-1 text-sm text-text-muted">Your signed-in profile</p>

      <dl class="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-text-muted">Display name</dt>
          <dd class="mt-0.5 font-medium">{{ auth.profile?.displayName ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-text-muted">Email</dt>
          <dd class="mt-0.5">{{ auth.profile?.email ?? '—' }}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-text-muted">Member since</dt>
          <dd class="mt-0.5">{{ memberSince }}</dd>
        </div>
      </dl>

      <button
        type="button"
        class="mt-5 rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text md:hidden"
        @click="auth.signOutUser()"
      >
        Sign out
      </button>
    </section>

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
      <h2 class="text-lg font-medium">Library</h2>
      <p class="mt-2 text-sm text-text-muted">
        Re-fetch album covers from Cover Art Archive, or artist photos via MusicBrainz and Wikidata
        (with album-cover fallback). May take a while for large libraries.
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
          :disabled="coverRefreshing"
          @click="handleRefreshCoverUrls"
        >
          {{ coverRefreshing ? 'Refreshing covers…' : 'Refresh cover art' }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
          :disabled="artistImageRefreshing"
          @click="handleRefreshArtistImages"
        >
          {{ artistImageRefreshing ? 'Refreshing photos…' : 'Refresh artist photos' }}
        </button>
      </div>

      <p v-if="coverMessage" class="mt-3 text-sm text-emerald-400">{{ coverMessage }}</p>
      <p v-if="coverError" class="mt-3 text-sm text-red-300">{{ coverError }}</p>
      <p v-if="artistImageMessage" class="mt-3 text-sm text-emerald-400">{{ artistImageMessage }}</p>
      <p v-if="artistImageError" class="mt-3 text-sm text-red-300">{{ artistImageError }}</p>
    </section>

    <section class="rounded-xl border border-border bg-surface-raised/50 p-6">
      <h2 class="text-lg font-medium">v1 pipeline migration</h2>
      <p class="mt-2 text-sm text-text-muted">
        Stage v1 funnel history, match albums to the library, and apply
        <code class="text-text">StageMembership</code> rows.
      </p>
      <RouterLink
        to="/migration"
        class="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted"
      >
        Open migration
      </RouterLink>
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

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
          :disabled="saving"
          @click="saveMusicBrainzUserAgent"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <span v-if="saved" class="text-sm text-emerald-400">Saved</span>
        <span v-if="saveError" class="text-sm text-red-300">{{ saveError }}</span>
      </div>
    </section>
  </div>
</template>
