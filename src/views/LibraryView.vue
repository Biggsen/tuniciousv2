<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { listAlbums } from '@/lib/album/firestore'
import { useAuthStore } from '@/stores/auth'
import type { Album } from '@/types/library'

const auth = useAuthStore()

const albums = ref<Album[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  if (!auth.user) return

  try {
    albums.value = await listAlbums(auth.user.uid)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load library'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <p v-if="!loading && !error && !albums.length" class="text-sm text-text-muted">
      No albums yet. Browse the
      <RouterLink to="/explorer" class="text-accent hover:underline">Explorer</RouterLink>
      and import a release.
    </p>

    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" />

    <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="album in albums" :key="album.id">
        <RouterLink
          :to="{ name: 'album-detail', params: { id: album.id } }"
          class="flex gap-4 rounded-xl border border-border bg-surface-raised/50 p-4 transition-colors hover:border-accent/40"
        >
          <div
            class="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface"
          >
            <img
              v-if="album.coverUrl"
              :src="album.coverUrl"
              :alt="album.title"
              class="h-full w-full object-cover"
            />
            <div
              v-else
              class="flex h-full w-full items-center justify-center text-xs text-text-muted"
            >
              No art
            </div>
          </div>
          <div class="min-w-0">
            <p class="truncate font-medium">{{ album.title }}</p>
            <p class="mt-1 truncate text-sm text-text-muted">{{ album.artist }}</p>
            <p v-if="album.albumYear" class="mt-1 text-xs text-text-muted">{{ album.albumYear }}</p>
          </div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
