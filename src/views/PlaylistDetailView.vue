<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import AddAlbumPanel from '@/components/playlist/AddAlbumPanel.vue'
import PlaylistAlbumCard from '@/components/playlist/PlaylistAlbumCard.vue'
import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { isLastfmConnected, refreshPlaylistPlaycounts } from '@/lib/lastfm/scrobble'
import {
  getPlaylistById,
  listPlaylistMembers,
  reorderPlaylistMember,
  updatePlaylist,
} from '@/lib/playlist/firestore'
import {
  applyWorkflowAction,
  handleStagePlaylistAdd,
  handleStagePlaylistRemoval,
  listPlaylistWorkflowStates,
  undoLastWorkflowStep,
  type PlaylistWorkflowRowState,
} from '@/lib/pipeline/service'
import { sortPlaylistMembers, type PlaylistSortField } from '@/lib/playlist/sortMembers'
import { getTrackPlayStatsMap } from '@/lib/sessions/firestore'
import { getMappingsForTrackIds } from '@/lib/youtube/firestore'
import { useAuthStore } from '@/stores/auth'
import { usePlaybackStore } from '@/stores/playback'
import type { Playlist, PlaylistMember } from '@/types/library'
import type { WorkflowAction } from '@/types/pipeline'
import type { TrackPlayStats } from '@/types/sessions'
import type { TrackYouTubeMapping } from '@/types/youtube'

const route = useRoute()
const auth = useAuthStore()
const playback = usePlaybackStore()

const playlist = ref<Playlist | null>(null)
const members = ref<PlaylistMember[]>([])
const mappings = ref<Map<string, TrackYouTubeMapping>>(new Map())
const playStats = ref<Map<string, TrackPlayStats>>(new Map())
const loading = ref(true)
const reloading = ref(false)
const refreshing = ref(false)
const error = ref<string | null>(null)
const playError = ref<string | null>(null)
const refreshMessage = ref<string | null>(null)
const editingName = ref(false)
const nameDraft = ref('')
const savingName = ref(false)
const nameError = ref<string | null>(null)
const menuOpen = ref(false)
const showTracklist = ref(true)
const sortField = ref<PlaylistSortField>('date-added')
const sortAscending = ref(false)
const lastfmConnected = ref(false)
const workflowEnabled = ref(false)
const workflowBlockedReason = ref<string | null>(null)
const workflowByAlbumId = ref<Map<string, PlaylistWorkflowRowState>>(new Map())

const playlistId = () => String(route.params.id)

const memberAlbumIds = computed(() => members.value.map((member) => member.album.id))

const totalTracks = computed(() =>
  members.value.reduce((sum, member) => sum + member.album.tracks.length, 0),
)

const resolvedTracks = computed(() => {
  const trackIds = members.value.flatMap((member) => member.album.tracks.map((t) => t.id))
  return trackIds.filter((id) => mappings.value.has(id)).length
})

const sortedMembers = computed(() =>
  sortPlaylistMembers(members.value, sortField.value, sortAscending.value),
)

function memberPosition(albumId: string): number {
  return members.value.findIndex((member) => member.album.id === albumId)
}

async function loadTrackData() {
  if (!auth.user) return
  const trackIds = members.value.flatMap((member) => member.album.tracks.map((track) => track.id))
  const [loadedMappings, loadedStats] = await Promise.all([
    getMappingsForTrackIds(auth.user.uid, trackIds),
    getTrackPlayStatsMap(auth.user.uid, trackIds),
  ])
  mappings.value = loadedMappings
  playStats.value = loadedStats
}

function workflowStateForAlbum(albumId: string): PlaylistWorkflowRowState | undefined {
  return workflowByAlbumId.value.get(albumId)
}

async function load({ showFullPageLoader = true } = {}) {
  if (!auth.user) return

  if (showFullPageLoader) {
    loading.value = true
  } else {
    reloading.value = true
  }
  error.value = null
  playError.value = null
  refreshMessage.value = null

  try {
    lastfmConnected.value = await isLastfmConnected(auth.user.uid)
    playlist.value = await getPlaylistById(auth.user.uid, playlistId())
    if (!playlist.value) {
      error.value = 'Playlist not found'
      return
    }
    editingName.value = false
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
    const workflowState = await listPlaylistWorkflowStates(
      auth.user.uid,
      playlistId(),
      members.value.map((member) => member.album.id),
    )
    workflowEnabled.value = workflowState.enabled
    workflowBlockedReason.value = workflowState.blockedReason ?? null
    workflowByAlbumId.value = workflowState.byAlbumId
    await loadTrackData()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load playlist'
  } finally {
    loading.value = false
    reloading.value = false
  }
}

async function handleAdd(albumId: string) {
  if (!auth.user) return

  try {
    await handleStagePlaylistAdd(auth.user.uid, { playlistId: playlistId(), albumId })
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
    const workflowState = await listPlaylistWorkflowStates(
      auth.user.uid,
      playlistId(),
      members.value.map((member) => member.album.id),
    )
    workflowEnabled.value = workflowState.enabled
    workflowBlockedReason.value = workflowState.blockedReason ?? null
    workflowByAlbumId.value = workflowState.byAlbumId
    await loadTrackData()
    playlist.value = await getPlaylistById(auth.user.uid, playlistId())
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to add album'
  }
}

async function handleRemove(albumId: string) {
  if (!auth.user) return

  try {
    await handleStagePlaylistRemoval(auth.user.uid, { playlistId: playlistId(), albumId })
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
    const workflowState = await listPlaylistWorkflowStates(
      auth.user.uid,
      playlistId(),
      members.value.map((member) => member.album.id),
    )
    workflowEnabled.value = workflowState.enabled
    workflowBlockedReason.value = workflowState.blockedReason ?? null
    workflowByAlbumId.value = workflowState.byAlbumId
    await loadTrackData()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to remove album'
  }
}

async function handleWorkflowAction(albumId: string, action: WorkflowAction) {
  if (!auth.user) return
  error.value = null
  try {
    await applyWorkflowAction(auth.user.uid, {
      playlistId: playlistId(),
      albumId,
      action,
    })
    await load({ showFullPageLoader: false })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to apply workflow action'
  }
}

async function handleUndoWorkflow(albumId: string) {
  if (!auth.user) return
  error.value = null
  try {
    await undoLastWorkflowStep(auth.user.uid, {
      playlistId: playlistId(),
      albumId,
    })
    await load({ showFullPageLoader: false })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to undo workflow step'
  }
}

async function handleReorder(albumId: string, direction: 'up' | 'down') {
  if (!auth.user) return

  try {
    await reorderPlaylistMember(auth.user.uid, playlistId(), albumId, direction)
    members.value = await listPlaylistMembers(auth.user.uid, playlistId())
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

async function handlePlayRandom() {
  if (!auth.user) return
  playError.value = null
  const started = await playback.playRandomFromPlaylist(
    members.value,
    playlistId(),
    auth.user.uid,
  )
  if (!started) {
    playError.value = playback.error ?? 'No resolved tracks to play'
  }
}

async function handleRefreshPlaycounts() {
  if (!auth.user || !lastfmConnected.value) return

  refreshing.value = true
  refreshMessage.value = null
  error.value = null

  try {
    const synced = await refreshPlaylistPlaycounts(auth.user.uid, members.value)
    await loadTrackData()
    refreshMessage.value = `Synced playcounts for ${synced} tracks`
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to refresh playcounts'
  } finally {
    refreshing.value = false
  }
}

function startRename() {
  if (!playlist.value) return
  nameDraft.value = playlist.value.name
  editingName.value = true
  nameError.value = null
  menuOpen.value = false
}

function cancelRename() {
  editingName.value = false
  nameError.value = null
}

async function saveRename() {
  if (!auth.user || !playlist.value || !nameDraft.value.trim()) return

  savingName.value = true
  nameError.value = null

  try {
    const trimmed = nameDraft.value.trim()
    await updatePlaylist(auth.user.uid, playlistId(), { name: trimmed })
    playlist.value = { ...playlist.value, name: trimmed }
    editingName.value = false
  } catch (err) {
    nameError.value = err instanceof Error ? err.message : 'Failed to rename playlist'
  } finally {
    savingName.value = false
  }
}

function toggleSortDirection() {
  sortAscending.value = !sortAscending.value
}

onMounted(() => load())
watch(() => route.params.id, () => load())
</script>

<template>
  <div>
    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error && !playlist" :message="error" />
    <template v-else-if="playlist">
      <div class="mb-6 flex items-center justify-between gap-4">
        <RouterLink
          :to="{ name: 'playlists' }"
          class="inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text"
        >
          ← Back
        </RouterLink>

        <div class="flex items-center gap-2">
          <button
            v-if="lastfmConnected"
            type="button"
            class="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
            :disabled="refreshing || reloading"
            @click="handleRefreshPlaycounts"
          >
            {{ refreshing ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
            :disabled="reloading || refreshing"
            @click="load({ showFullPageLoader: false })"
          >
            {{ reloading ? 'Reloading…' : 'Reload' }}
          </button>
          <div class="relative">
            <button
              type="button"
              class="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5"
              aria-label="Playlist menu"
              @click="menuOpen = !menuOpen"
            >
              ⋮
            </button>
            <div
              v-if="menuOpen"
              class="absolute right-0 z-10 mt-1 min-w-36 rounded-lg border border-border bg-surface py-1 shadow-lg"
            >
              <button
                type="button"
                class="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/5"
                @click="startRename"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      </div>

      <header class="mb-6">
        <div v-if="editingName" class="flex max-w-xl flex-wrap items-center gap-2">
          <input
            v-model="nameDraft"
            type="text"
            required
            class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-2xl font-semibold outline-none focus:border-accent"
            :disabled="savingName"
            @keydown.enter.prevent="saveRename"
            @keydown.escape="cancelRename"
          />
          <button
            type="button"
            class="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
            :disabled="savingName || !nameDraft.trim()"
            @click="saveRename"
          >
            Save
          </button>
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
            :disabled="savingName"
            @click="cancelRename"
          >
            Cancel
          </button>
        </div>
        <template v-else>
          <h2 class="text-3xl font-semibold tracking-tight">{{ playlist.name }}</h2>
          <p class="mt-2 text-sm text-text-muted">
            <span>{{ members.length }} album{{ members.length === 1 ? '' : 's' }}</span>
            <span class="mx-2">·</span>
            <span>{{ totalTracks }} track{{ totalTracks === 1 ? '' : 's' }}</span>
            <span class="mx-2">·</span>
            <span>{{ resolvedTracks }}/{{ totalTracks }} resolved</span>
          </p>
        </template>
        <p v-if="nameError" class="mt-2 text-sm text-red-300">{{ nameError }}</p>
        <p v-if="playlist.description" class="mt-2 text-sm text-text-muted">
          {{ playlist.description }}
        </p>
      </header>

      <div class="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <label class="inline-flex cursor-pointer items-center gap-3 text-sm">
          <span class="text-text-muted">Tracklist</span>
          <button
            type="button"
            class="relative h-6 w-11 rounded-full transition-colors"
            :class="showTracklist ? 'bg-accent' : 'bg-white/15'"
            role="switch"
            :aria-checked="showTracklist"
            @click="showTracklist = !showTracklist"
          >
            <span
              class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform"
              :class="showTracklist ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </label>

        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-xs font-medium uppercase tracking-wider text-text-muted">Sort by</span>
          <select
            v-model="sortField"
            class="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50"
          >
            <option value="date-added">Date added</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
            <option value="year">Year</option>
          </select>
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-2 transition-colors hover:bg-white/5"
            :title="sortAscending ? 'Ascending' : 'Descending'"
            @click="toggleSortDirection"
          >
            {{ sortAscending ? '↑' : '↓' }}
          </button>
        </div>
      </div>

      <div class="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
          :disabled="!members.length || resolvedTracks === 0"
          @click="handlePlay"
        >
          Play
        </button>
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
          :disabled="!members.length || resolvedTracks === 0"
          @click="handlePlayRandom"
        >
          Play Random
        </button>
        <AddAlbumPanel
          v-if="auth.user"
          :uid="auth.user.uid"
          :member-album-ids="memberAlbumIds"
          @add="handleAdd"
        />
      </div>

      <p v-if="refreshMessage" class="mb-4 text-sm text-emerald-300">{{ refreshMessage }}</p>
      <p v-if="playError" class="mb-4 text-sm text-red-300">{{ playError }}</p>
      <p v-if="error" class="mb-4 text-sm text-red-300">{{ error }}</p>
      <p v-if="workflowEnabled && workflowBlockedReason" class="mb-4 text-sm text-amber-300">
        {{ workflowBlockedReason }}
      </p>

      <p v-if="!members.length" class="text-sm text-text-muted">
        This playlist is empty. Add albums from your
        <RouterLink to="/library" class="text-accent hover:underline">library</RouterLink>
        — unresolved albums are fine; resolve tracks before playing.
      </p>

      <ul
        v-else
        class="grid justify-start gap-5 grid-cols-[repeat(auto-fill,minmax(min(100%,280px),300px))]"
      >
        <li v-for="member in sortedMembers" :key="member.album.id">
          <PlaylistAlbumCard
            :member="member"
            :playlist-id="playlistId()"
            :mappings="mappings"
            :play-stats="playStats"
            :show-tracklist="showTracklist"
            :can-move-up="memberPosition(member.album.id) > 0"
            :can-move-down="memberPosition(member.album.id) < members.length - 1"
            :workflow-actions="workflowStateForAlbum(member.album.id)?.actions ?? []"
            :can-undo-workflow="workflowStateForAlbum(member.album.id)?.canUndo ?? false"
            :workflow-blocked-reason="workflowStateForAlbum(member.album.id)?.blockedReason"
            @remove="handleRemove(member.album.id)"
            @move-up="handleReorder(member.album.id, 'up')"
            @move-down="handleReorder(member.album.id, 'down')"
            @workflow-action="handleWorkflowAction(member.album.id, $event)"
            @undo-workflow="handleUndoWorkflow(member.album.id)"
          />
        </li>
      </ul>
    </template>
  </div>
</template>
