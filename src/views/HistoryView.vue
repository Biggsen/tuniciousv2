<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { formatDuration } from '@/lib/musicbrainz/format'
import { listRecentPlaybackSessions, listRecentTrackListens } from '@/lib/sessions/firestore'
import { useAuthStore } from '@/stores/auth'
import type { PlaybackSession, TrackListenRecord } from '@/types/sessions'

const auth = useAuthStore()

const sessions = ref<PlaybackSession[]>([])
const listens = ref<TrackListenRecord[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const sessionById = computed(() => {
  const map = new Map<string, PlaybackSession>()
  for (const session of sessions.value) {
    map.set(session.id, session)
  }
  return map
})

function formatWhen(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function endReasonLabel(reason: TrackListenRecord['endReason']): string {
  switch (reason) {
    case 'completed':
      return 'Finished'
    case 'skipped':
      return 'Skipped'
    case 'stopped':
      return 'Stopped'
    case 'queue_cleared':
      return 'Queue cleared'
    case 'error':
      return 'Error'
    default:
      return reason
  }
}

function sessionLabel(session: PlaybackSession): string {
  const source =
    session.sourceType === 'playlist' && session.sourcePlaylistId
      ? 'playlist'
      : 'album'
  return `${session.albumTitle} · ${session.artist} (${source})`
}

onMounted(async () => {
  if (!auth.user) return

  try {
    const [recentSessions, recentListens] = await Promise.all([
      listRecentPlaybackSessions(auth.user.uid, 20),
      listRecentTrackListens(auth.user.uid, 50),
    ])
    sessions.value = recentSessions
    listens.value = recentListens
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load listening history'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <p v-if="!loading && !error && !listens.length" class="text-sm text-text-muted">
      No listening history yet. Play something from your
      <RouterLink to="/library" class="text-accent hover:underline">Library</RouterLink>
      or a
      <RouterLink to="/playlists" class="text-accent hover:underline">Playlist</RouterLink>.
    </p>

    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" />

    <div v-else class="space-y-10">
      <section>
        <h2 class="mb-4 text-sm font-medium uppercase tracking-wide text-text-muted">
          Recent listens
        </h2>
        <ul class="divide-y divide-border rounded-xl border border-border bg-surface-raised/50">
          <li
            v-for="listen in listens"
            :key="listen.id"
            class="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
          >
            <div class="min-w-0">
              <p class="truncate font-medium">{{ listen.title }}</p>
              <p class="mt-0.5 truncate text-sm text-text-muted">
                {{ listen.artist }} · {{ listen.albumTitle }}
              </p>
              <p
                v-if="sessionById.get(listen.playbackSessionId)"
                class="mt-1 text-xs text-text-muted"
              >
                Session: {{ sessionLabel(sessionById.get(listen.playbackSessionId)!) }}
              </p>
            </div>
            <div class="shrink-0 text-right text-xs text-text-muted">
              <p>{{ formatWhen(listen.startedAt) }}</p>
              <p class="mt-1">
                {{ formatDuration(listen.listenedMs) }}
                <span v-if="listen.trackLengthMs">
                  / {{ formatDuration(listen.trackLengthMs) }}
                </span>
              </p>
              <p class="mt-1">
                <span
                  v-if="listen.completed"
                  class="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300"
                >
                  Completed
                </span>
                <span v-else class="text-text-muted">{{ endReasonLabel(listen.endReason) }}</span>
              </p>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="sessions.length">
        <h2 class="mb-4 text-sm font-medium uppercase tracking-wide text-text-muted">
          Playback sessions
        </h2>
        <ul class="divide-y divide-border rounded-xl border border-border bg-surface-raised/50">
          <li
            v-for="session in sessions"
            :key="session.id"
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div class="min-w-0">
              <RouterLink
                :to="{ name: 'album-detail', params: { id: session.albumId } }"
                class="truncate font-medium text-accent hover:underline"
              >
                {{ session.albumTitle }}
              </RouterLink>
              <p class="mt-0.5 truncate text-sm text-text-muted">{{ session.artist }}</p>
            </div>
            <div class="shrink-0 text-right text-xs text-text-muted">
              <p>{{ formatWhen(session.startedAt) }}</p>
              <p v-if="session.endedAt" class="mt-1">Ended {{ formatWhen(session.endedAt) }}</p>
              <p v-else class="mt-1 text-amber-200">In progress</p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
