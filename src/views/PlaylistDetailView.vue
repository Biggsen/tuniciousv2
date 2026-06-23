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
import { getMappingsForTrackIds } from '@/lib/youtube/firestore'
import { useAuthStore } from '@/stores/auth'
import { usePlaybackStore } from '@/stores/playback'
import type { Playlist, PlaylistMember } from '@/types/library'

import type { TrackYouTubeMapping } from '@/types/youtube'

const route = useRoute()
const auth = useAuthStore()
const playback = usePlaybackStore()

const playlist = ref<Playlist | null>(null)
const members = ref<PlaylistMember[]>([])
const mappings = ref<Map<string, TrackYouTubeMapping>>(new Map())
const loading = ref(true)
const error = ref<string | null>(null)
const playError = ref<string | null>(null)

const playlistId = () => String(route.params.id)

const memberAlbumIds = computed(() => members.value.map((member) => member.album.id))

const totalTracks = computed(() =>
  members.value.reduce((sum, member) => sum + member.album.tracks.length, 0),
)

const resolvedTracks = computed(() => {
  const trackIds = members.value.flatMap((member) => member.album.tracks.map((t) => t.id))
  return trackIds.filter((id) => mappings.value.has(id)).length
})

function albumResolvedCount(albumId: string): { resolved: number; total: number } {
  const member = members.value.find((item) => item.album.id === albumId)
  if (!member) return { resolved: 0, total: 0 }
  const total = member.album.tracks.length
  const resolved = member.album.tracks.filter((track) => mappings.value.has(track.id)).length
  return { resolved, total }
}

async function loadMappings() {
  if (!auth.user) return
  const trackIds = members.value.flatMap((member) => member.album.tracks.map((track) => track.id))
  mappings.value = await getMappingsForTrackIds(auth.user.uid, trackIds)
}

async function load() {
  if (!auth.user) return

  loading.value = true
  error.value = null
  playError.value = null

  try {
    playlist.value = await getPlaylistById(auth.user.uid, playlistId())
    if (!playlist.value) {
      error.value = 'Playlist not found'
      return
    }
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
    await loadMappings()
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
    await loadMappings()
    playlist.value = await getPlaylistById(auth.user.uid, playlistId())
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to add album'
  }
}

async function handleRemove(albumId: string) {
  if (!auth.user) return

  try {
    await removeAlbumFromPlaylist(auth.user.uid, playlistId(), albumId)
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
    await loadMappings()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to remove album'
  }
}

async function handleReorder(albumId: string, direction: 'up' | 'down') {
  if (!auth.user) return

  try {
    await reorderPlaylistMember(auth.user.uid, playlistId(), albumId, direction)
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
    await loadMappings()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to reorder'
  }
}

async function handlePlay() {
  if (!auth.user) return
  playError.value = null
  const started = await playback.playFromPlaylist(members.value, playlistId(), auth.user.uid)
  if (!started) {
    playError.value = playback.error ?? 'No resolved tracks to play'
  }
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
          · {{ resolvedTracks }}/{{ totalTracks }} resolved
        </p>
      </header>

      <div class="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
          :disabled="!members.length || resolvedTracks === 0"
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

      <p v-if="playError" class="mb-4 text-sm text-red-300">{{ playError }}</p>
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
              <span
                class="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px]"
                :class="
                  albumResolvedCount(member.album.id).resolved ===
                  albumResolvedCount(member.album.id).total
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-amber-500/15 text-amber-200'
                "
              >
                {{ albumResolvedCount(member.album.id).resolved }}/{{
                  albumResolvedCount(member.album.id).total
                }}
                resolved
              </span>
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
