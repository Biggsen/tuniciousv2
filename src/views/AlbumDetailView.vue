<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { formatDuration } from '@/lib/musicbrainz/format'
import { getAlbumById } from '@/lib/album/firestore'
import { useAuthStore } from '@/stores/auth'
import type { Album } from '@/types/library'

const route = useRoute()
const auth = useAuthStore()

const album = ref<Album | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  if (!auth.user) return

  try {
    album.value = await getAlbumById(auth.user.uid, String(route.params.id))
    if (!album.value) {
      error.value = 'Album not found'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load album'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" />
    <template v-else-if="album">
      <header class="mb-6 flex gap-6">
        <div class="h-40 w-40 shrink-0 overflow-hidden rounded-xl bg-surface-raised">
          <img
            v-if="album.coverUrl"
            :src="album.coverUrl"
            :alt="album.title"
            class="h-full w-full object-cover"
          />
        </div>
        <div>
          <h2 class="text-2xl font-semibold">{{ album.title }}</h2>
          <p class="mt-1 text-sm text-text-muted">{{ album.artist }}</p>
          <p class="mt-2 text-xs text-text-muted">
            <template v-if="album.albumYear">{{ album.albumYear }}</template>
            <template v-if="album.type"> · {{ album.type }}</template>
            <template v-if="album.artistIds.length > 1">
              · {{ album.artistIds.length }} artists
            </template>
          </p>
          <p class="mt-3 text-xs text-text-muted">
            Imported {{ album.importedAt.toLocaleDateString() }}
          </p>
        </div>
      </header>

      <p class="mb-4 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-text-muted">
        YouTube resolution and playback arrive in Phase 4–5.
      </p>

      <h3 class="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">Tracklist</h3>
      <ol class="divide-y divide-border rounded-xl border border-border">
        <li
          v-for="track in album.tracks"
          :key="track.id"
          class="flex items-center gap-4 px-4 py-2.5 text-sm"
        >
          <span class="w-8 shrink-0 text-right text-text-muted tabular-nums">
            {{ track.trackNumber }}
          </span>
          <span class="min-w-0 flex-1 truncate">{{ track.title }}</span>
          <span class="shrink-0 text-xs text-text-muted tabular-nums">
            {{ formatDuration(track.lengthMs) }}
          </span>
        </li>
      </ol>
    </template>
  </div>
</template>
