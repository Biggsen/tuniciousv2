<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { createPlaylist, deletePlaylist, listPlaylists } from '@/lib/playlist/firestore'
import { useAuthStore } from '@/stores/auth'
import type { Playlist } from '@/types/library'

const auth = useAuthStore()
const router = useRouter()

const playlists = ref<Playlist[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const creating = ref(false)
const newName = ref('')

async function load() {
  if (!auth.user) return

  loading.value = true
  error.value = null

  try {
    playlists.value = await listPlaylists(auth.user.uid)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load playlists'
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  if (!auth.user || !newName.value.trim()) return

  creating.value = true
  error.value = null

  try {
    const playlist = await createPlaylist(auth.user.uid, newName.value)
    newName.value = ''
    await router.push({ name: 'playlist-detail', params: { id: playlist.id } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create playlist'
    creating.value = false
  }
}

async function handleDelete(playlist: Playlist) {
  if (!auth.user) return
  if (!confirm(`Delete playlist "${playlist.name}"?`)) return

  try {
    await deletePlaylist(auth.user.uid, playlist.id)
    playlists.value = playlists.value.filter((item) => item.id !== playlist.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete playlist'
  }
}

onMounted(load)
</script>

<template>
  <div>
    <form class="mb-6 flex max-w-md gap-2" @submit.prevent="handleCreate">
      <input
        v-model="newName"
        type="text"
        required
        placeholder="New playlist name"
        class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        class="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
        :disabled="creating || !newName.trim()"
      >
        Create
      </button>
    </form>

    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" class="mb-4" />

    <p v-else-if="!playlists.length" class="text-sm text-text-muted">
      No playlists yet. Create one above, then add albums from your library.
    </p>

    <ul v-else class="divide-y divide-border rounded-xl border border-border">
      <li
        v-for="playlist in playlists"
        :key="playlist.id"
        class="flex items-center justify-between gap-4 px-4 py-3"
      >
        <RouterLink
          :to="{ name: 'playlist-detail', params: { id: playlist.id } }"
          class="min-w-0 flex-1 transition-colors hover:text-accent"
        >
          <span class="font-medium">{{ playlist.name }}</span>
          <span class="mt-0.5 block text-xs text-text-muted">
            Updated {{ playlist.updatedAt.toLocaleDateString() }}
          </span>
        </RouterLink>
        <button
          type="button"
          class="shrink-0 text-sm text-text-muted transition-colors hover:text-red-300"
          @click="handleDelete(playlist)"
        >
          Delete
        </button>
      </li>
    </ul>
  </div>
</template>
