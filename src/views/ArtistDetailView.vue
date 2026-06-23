<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { getArtistById } from '@/lib/artist/firestore'
import { listAlbumsByArtist } from '@/lib/album/firestore'
import { useAuthStore } from '@/stores/auth'
import type { Album, Artist } from '@/types/library'

const route = useRoute()
const auth = useAuthStore()

const artist = ref<Artist | null>(null)
const albums = ref<Album[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  if (!auth.user) return

  const artistId = String(route.params.id)

  try {
    artist.value = await getArtistById(auth.user.uid, artistId)
    if (!artist.value) {
      error.value = 'Artist not found'
      return
    }
    albums.value = await listAlbumsByArtist(auth.user.uid, artistId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load artist'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" />
    <template v-else-if="artist">
      <header class="mb-6">
        <h2 class="text-2xl font-semibold">{{ artist.name }}</h2>
      </header>

      <h3 class="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">
        Albums in library
      </h3>

      <p v-if="!albums.length" class="text-sm text-text-muted">
        No albums for this artist yet.
      </p>

      <ul v-else class="divide-y divide-border rounded-xl border border-border">
        <li v-for="album in albums" :key="album.id">
          <RouterLink
            :to="{ name: 'album-detail', params: { id: album.id } }"
            class="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/5"
          >
            <div class="h-12 w-12 shrink-0 overflow-hidden rounded bg-surface">
              <img
                v-if="album.coverUrl"
                :src="album.coverUrl"
                :alt="album.title"
                class="h-full w-full object-cover"
              />
            </div>
            <span>
              <span class="font-medium">{{ album.title }}</span>
              <span v-if="album.albumYear" class="mt-0.5 block text-xs text-text-muted">
                {{ album.albumYear }}
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </div>
</template>
