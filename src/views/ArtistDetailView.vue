<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { getArtistById, setArtistScrobbleName } from '@/lib/artist/firestore'
import { listAlbumsByArtist } from '@/lib/album/firestore'
import { useAuthStore } from '@/stores/auth'
import type { Album, Artist } from '@/types/library'

const route = useRoute()
const auth = useAuthStore()

const artist = ref<Artist | null>(null)
const albums = ref<Album[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const scrobbleName = ref('')
const savingScrobbleName = ref(false)
const scrobbleNameSaved = ref(false)
const scrobbleNameError = ref<string | null>(null)

onMounted(async () => {
  if (!auth.user) return

  const artistId = String(route.params.id)

  try {
    artist.value = await getArtistById(auth.user.uid, artistId)
    if (!artist.value) {
      error.value = 'Artist not found'
      return
    }
    scrobbleName.value = artist.value.scrobbleName ?? ''
    albums.value = await listAlbumsByArtist(auth.user.uid, artistId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load artist'
  } finally {
    loading.value = false
  }
})

async function saveScrobbleName() {
  if (!auth.user || !artist.value) return

  savingScrobbleName.value = true
  scrobbleNameSaved.value = false
  scrobbleNameError.value = null

  try {
    artist.value = await setArtistScrobbleName(
      auth.user.uid,
      artist.value.id,
      scrobbleName.value,
    )
    scrobbleNameSaved.value = true
  } catch (err) {
    scrobbleNameError.value =
      err instanceof Error ? err.message : 'Failed to save Last.fm artist name'
  } finally {
    savingScrobbleName.value = false
  }
}
</script>

<template>
  <div>
    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" />
    <template v-else-if="artist">
      <header class="mb-6">
        <h2 class="text-2xl font-semibold">{{ artist.name }}</h2>
      </header>

      <section class="mb-8 rounded-xl border border-border bg-surface-raised/50 p-4">
        <h3 class="text-sm font-medium">Last.fm artist name</h3>
        <p class="mt-1 text-sm text-text-muted">
          Override when MusicBrainz credit does not match Last.fm (e.g. featured artists, punctuation).
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <input
            v-model="scrobbleName"
            type="text"
            :placeholder="artist.name"
            class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
            :disabled="savingScrobbleName"
            @click="saveScrobbleName"
          >
            Save
          </button>
        </div>
        <p v-if="scrobbleNameSaved" class="mt-2 text-sm text-emerald-400">Saved</p>
        <p v-if="scrobbleNameError" class="mt-2 text-sm text-red-300">{{ scrobbleNameError }}</p>
      </section>

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
