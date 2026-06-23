<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { listArtists } from '@/lib/artist/firestore'
import { useAuthStore } from '@/stores/auth'
import type { Artist } from '@/types/library'

const auth = useAuthStore()

const artists = ref<Artist[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  if (!auth.user) return

  try {
    artists.value = await listArtists(auth.user.uid)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load artists'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <p v-if="!loading && !error && !artists.length" class="text-sm text-text-muted">
      Artists appear when you import albums from the Explorer.
    </p>

    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" />

    <ul v-else class="divide-y divide-border rounded-xl border border-border">
      <li v-for="artist in artists" :key="artist.id">
        <RouterLink
          :to="{ name: 'artist-detail', params: { id: artist.id } }"
          class="block px-4 py-3 transition-colors hover:bg-white/5"
        >
          <span class="font-medium">{{ artist.name }}</span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
