<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import AddAlbumPanel from '@/components/playlist/AddAlbumPanel.vue'
import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import {
  addAlbumToPlaylist,
  getPlaylistById,
  listPlaylistMembers,
  removeAlbumFromPlaylist,
  reorderPlaylistMember,
} from '@/lib/playlist/firestore'
import { useAuthStore } from '@/stores/auth'
import { usePlaybackStore } from '@/stores/playback'
import type { Playlist, PlaylistMember } from '@/types/library'

const route = useRoute()
const auth = useAuthStore()
const playback = usePlaybackStore()

const playlist = ref<Playlist | null>(null)
const members = ref<PlaylistMember[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const queueReady = ref(false)

const playlistId = () => String(route.params.id)

const memberAlbumIds = computed(() => members.value.map((member) => member.album.id))

const totalTracks = computed(() =>
  members.value.reduce((sum, member) => sum + member.album.tracks.length, 0),
)

async function load() {
  if (!auth.user) return

  loading.value = true
  error.value = null
  queueReady.value = false

  try {
    playlist.value = await getPlaylistById(auth.user.uid, playlistId())
    if (!playlist.value) {
      error.value = 'Playlist not found'
      return
    }
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load playlist'
  } finally {
    loading.value = false
  }
}

async function handleAdd(albumId: string) {
  if (!auth.user) return

  try {
    await addAlbumToPlaylist(auth.user.uid, playlistId(), albumId)
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
    playlist.value = await getPlaylistById(auth.user.uid, playlistId())
    queueReady.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to add album'
  }
}

async function handleRemove(albumId: string) {
  if (!auth.user) return

  try {
    await removeAlbumFromPlaylist(auth.user.uid, playlistId(), albumId)
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
    queueReady.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to remove album'
  }
}

async function handleReorder(albumId: string, direction: 'up' | 'down') {
  if (!auth.user) return

  try {
    await reorderPlaylistMember(auth.user.uid, playlistId(), albumId, direction)
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
    queueReady.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to reorder'
  }
}

function handlePlay() {
  playback.setQueueFromPlaylist(members.value, playlistId())
  queueReady.value = true
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<template>
  <div>
    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error && !playlist" :message="error" />
    <template v-else-if="playlist">
      <header class="mb-6">
        <h2 class="text-2xl font-semibold">{{ playlist.name }}</h2>
        <p v-if="playlist.description" class="mt-1 text-sm text-text-muted">
          {{ playlist.description }}
        </p>
        <p class="mt-2 text-xs text-text-muted">
          {{ members.length }} album{{ members.length === 1 ? '' : 's' }}
          · {{ totalTracks }} track{{ totalTracks === 1 ? '' : 's' }}
        </p>
      </header>

      <div class="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
          :disabled="!members.length"
          @click="handlePlay"
        >
          Play
        </button>
        <AddAlbumPanel
          v-if="auth.user"
          :uid="auth.user.uid"
          :member-album-ids="memberAlbumIds"
          @add="handleAdd"
        />
      </div>

      <p
        v-if="queueReady"
        class="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm"
      >
        Queue ready — {{ playback.trackCount }} tracks. Playback engine arrives in Phase 5.
      </p>

      <p v-if="error" class="mb-4 text-sm text-red-300">{{ error }}</p>

      <p v-if="!members.length" class="text-sm text-text-muted">
        This playlist is empty. Add albums from your
        <RouterLink to="/library" class="text-accent hover:underline">library</RouterLink>.
      </p>

      <ul v-else class="divide-y divide-border rounded-xl border border-border">
        <li
          v-for="(member, index) in members"
          :key="member.album.id"
          class="flex items-center gap-3 px-4 py-3"
        >
          <div class="flex flex-col gap-1">
            <button
              type="button"
              class="rounded px-1.5 text-xs text-text-muted transition-colors hover:bg-white/5 hover:text-text disabled:opacity-30"
              :disabled="index === 0"
              title="Move up"
              @click="handleReorder(member.album.id, 'up')"
            >
              ↑
            </button>
            <button
              type="button"
              class="rounded px-1.5 text-xs text-text-muted transition-colors hover:bg-white/5 hover:text-text disabled:opacity-30"
              :disabled="index === members.length - 1"
              title="Move down"
              @click="handleReorder(member.album.id, 'down')"
            >
              ↓
            </button>
          </div>

          <RouterLink
            :to="{ name: 'album-detail', params: { id: member.album.id } }"
            class="flex min-w-0 flex-1 items-center gap-3"
          >
            <div class="h-12 w-12 shrink-0 overflow-hidden rounded bg-surface">
              <img
                v-if="member.album.coverUrl"
                :src="member.album.coverUrl"
                :alt="member.album.title"
                class="h-full w-full object-cover"
              />
            </div>
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ member.album.title }}</span>
              <span class="block truncate text-xs text-text-muted">{{ member.album.artist }}</span>
            </span>
          </RouterLink>

          <button
            type="button"
            class="shrink-0 text-sm text-text-muted transition-colors hover:text-red-300"
            @click="handleRemove(member.album.id)"
          >
            Remove
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
