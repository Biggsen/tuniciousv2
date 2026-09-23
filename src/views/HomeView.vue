<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { formatDuration } from '@/lib/musicbrainz/format'
import { loadPlaybackState } from '@/lib/playback/persist'
import { listRecentTrackListens } from '@/lib/sessions/firestore'
import { useAuthStore } from '@/stores/auth'
import { usePlaybackStore } from '@/stores/playback'
import type { TrackListenRecord } from '@/types/sessions'

const auth = useAuthStore()
const playback = usePlaybackStore()

const listens = ref<TrackListenRecord[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const resuming = ref(false)
const resumeError = ref<string | null>(null)

const greeting = computed(() => {
  const name = auth.profile?.displayName ?? auth.user?.email?.split('@')[0] ?? 'there'
  const hour = new Date().getHours()
  if (hour < 12) return `Good morning, ${name}`
  if (hour < 18) return `Good afternoon, ${name}`
  return `Good evening, ${name}`
})

const persistedPlayback = computed(() => {
  const uid = auth.user?.uid
  if (!uid) return null
  return loadPlaybackState(uid)
})

const showNowPlaying = computed(() => playback.showPlayerBar && playback.currentItem)

const showResume = computed(
  () => !playback.showPlayerBar && persistedPlayback.value !== null,
)

const resumeLabel = computed(() => {
  const state = persistedPlayback.value
  if (!state) return null
  return {
    title: state.title,
    artist: state.artist,
    albumTitle: state.albumTitle,
    albumId: state.albumId,
    sourceType: state.sourceType,
    sourcePlaylistId: state.sourcePlaylistId,
  }
})

function formatWhen(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function handleResume() {
  if (!auth.user) return

  resuming.value = true
  resumeError.value = null

  try {
    const ok = await playback.resumeFromPersisted(auth.user.uid)
    if (!ok) {
      resumeError.value = 'Could not resume — the album or playlist may have been removed'
    }
  } catch (err) {
    resumeError.value = err instanceof Error ? err.message : 'Failed to resume playback'
  } finally {
    resuming.value = false
  }
}

onMounted(async () => {
  if (!auth.user) return

  try {
    listens.value = await listRecentTrackListens(auth.user.uid, 8)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load recent listens'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-10">
    <p class="text-lg font-medium">{{ greeting }}</p>

    <section v-if="showNowPlaying">
      <h2 class="mb-3 text-sm font-medium uppercase tracking-wide text-text-muted">
        Now playing
      </h2>
      <div
        class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/10 p-5"
      >
        <div class="min-w-0">
          <p class="truncate font-medium">{{ playback.currentItem!.title }}</p>
          <p class="mt-0.5 text-sm text-text-muted">
            {{ playback.currentItem!.artist }} · {{ playback.currentItem!.albumTitle }}
          </p>
          <RouterLink
            :to="{ name: 'album-detail', params: { id: playback.currentItem!.albumId } }"
            class="mt-2 inline-block text-xs text-accent hover:underline"
          >
            View album
          </RouterLink>
        </div>
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted"
          @click="playback.togglePlayPause()"
        >
          {{ playback.isPlaying ? 'Pause' : 'Play' }}
        </button>
      </div>
    </section>

    <section v-else-if="showResume && resumeLabel">
      <h2 class="mb-3 text-sm font-medium uppercase tracking-wide text-text-muted">
        Continue listening
      </h2>
      <div
        class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface-raised/50 p-5"
      >
        <div class="min-w-0">
          <p class="truncate font-medium">{{ resumeLabel.title }}</p>
          <p class="mt-0.5 text-sm text-text-muted">
            {{ resumeLabel.artist }} · {{ resumeLabel.albumTitle }}
          </p>
          <RouterLink
            v-if="resumeLabel.sourceType === 'playlist' && resumeLabel.sourcePlaylistId"
            :to="{ name: 'playlist-detail', params: { id: resumeLabel.sourcePlaylistId } }"
            class="mt-2 mr-3 inline-block text-xs text-accent hover:underline"
          >
            View playlist
          </RouterLink>
          <RouterLink
            :to="{ name: 'album-detail', params: { id: resumeLabel.albumId } }"
            class="mt-2 inline-block text-xs text-accent hover:underline"
          >
            View album
          </RouterLink>
        </div>
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
          :disabled="resuming"
          @click="handleResume"
        >
          {{ resuming ? 'Resuming…' : 'Resume' }}
        </button>
      </div>
      <p v-if="resumeError" class="mt-2 text-sm text-red-300">{{ resumeError }}</p>
    </section>

    <section>
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 class="text-sm font-medium uppercase tracking-wide text-text-muted">
          Quick links
        </h2>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <RouterLink
          to="/explorer"
          class="rounded-xl border border-border bg-surface-raised/50 px-4 py-3 text-sm transition-colors hover:border-accent/40"
        >
          <span class="font-medium">Explorer</span>
          <span class="mt-0.5 block text-xs text-text-muted">Browse MusicBrainz</span>
        </RouterLink>
        <RouterLink
          to="/library"
          class="rounded-xl border border-border bg-surface-raised/50 px-4 py-3 text-sm transition-colors hover:border-accent/40"
        >
          <span class="font-medium">Library</span>
          <span class="mt-0.5 block text-xs text-text-muted">Your imported albums</span>
        </RouterLink>
        <RouterLink
          to="/playlists"
          class="rounded-xl border border-border bg-surface-raised/50 px-4 py-3 text-sm transition-colors hover:border-accent/40"
        >
          <span class="font-medium">Playlists</span>
          <span class="mt-0.5 block text-xs text-text-muted">Collections to play</span>
        </RouterLink>
      </div>
    </section>

    <section>
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 class="text-sm font-medium uppercase tracking-wide text-text-muted">
          Recent listens
        </h2>
        <RouterLink
          v-if="listens.length"
          to="/history"
          class="text-xs text-accent hover:underline"
        >
          View all
        </RouterLink>
      </div>

      <ExplorerLoading v-if="loading" />
      <ExplorerError v-else-if="error" :message="error" />

      <p v-else-if="!listens.length" class="text-sm text-text-muted">
        No listens yet. Play something from your
        <RouterLink to="/library" class="text-accent hover:underline">Library</RouterLink>
        or a
        <RouterLink to="/playlists" class="text-accent hover:underline">Playlist</RouterLink>.
      </p>

      <ul v-else class="divide-y divide-border rounded-xl border border-border bg-surface-raised/50">
        <li
          v-for="listen in listens"
          :key="listen.id"
          class="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
        >
          <div class="min-w-0">
            <RouterLink
              :to="{ name: 'album-detail', params: { id: listen.albumId } }"
              class="truncate font-medium text-accent hover:underline"
            >
              {{ listen.title }}
            </RouterLink>
            <p class="mt-0.5 text-sm text-text-muted">
              {{ listen.artist }} · {{ listen.albumTitle }}
            </p>
          </div>
          <div class="shrink-0 text-right text-xs text-text-muted">
            <p>{{ formatWhen(listen.startedAt) }}</p>
            <p class="mt-1">
              {{ formatDuration(listen.listenedMs) }}
              <span v-if="listen.completed" class="text-emerald-300">· Completed</span>
            </p>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
