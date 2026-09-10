<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SetupEvaluationFunnelPanel from '@/components/playlist/SetupEvaluationFunnelPanel.vue'
import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { deletePipelineCompletely } from '@/lib/pipeline/deletePipeline'
import { listEvaluationPipelines } from '@/lib/pipeline/firestore'
import { sortPlaylistsByPipelineStages } from '@/lib/pipeline/funnelDisplay'
import { listStagesByPipeline } from '@/lib/pipeline/stage'
import {
  createPlaylist,
  deletePlaylist,
  getPlaylistStatsMap,
  listPlaylists,
  type PlaylistStats,
} from '@/lib/playlist/firestore'
import {
  loadPlaylistStatsCache,
  playlistStatsMapFromCache,
  removePlaylistFromStatsCache,
  savePlaylistStatsCache,
} from '@/lib/playlist/persistStats'
import { useAuthStore } from '@/stores/auth'
import type { Pipeline, Stage } from '@/types/pipeline'
import type { Playlist } from '@/types/library'

const auth = useAuthStore()
const router = useRouter()

const playlists = ref<Playlist[]>([])
const playlistStats = ref<Map<string, PlaylistStats>>(new Map())
const statsUpdatedAt = ref<number | null>(null)
const refreshingStats = ref(false)
const evaluationPipelines = ref<Pipeline[]>([])
const pipelineStages = ref<Map<string, Stage[]>>(new Map())
const loading = ref(true)
const error = ref<string | null>(null)
const creating = ref(false)
const newName = ref('')
const showSetup = ref(false)
const funnelOpenState = ref<Record<string, boolean>>({})
const deletingPipelineId = ref<string | null>(null)
const deletingPlaylistId = ref<string | null>(null)
const deleteStagePlaylists = ref(false)

const pipelinePendingDelete = ref<Pipeline | null>(null)
const playlistPendingDelete = ref<Playlist | null>(null)
const FUNNEL_OPEN_STATE_STORAGE_KEY = 'tunicious.playlists.funnelOpenState.v1'

const pipelineDeleteStageCount = computed(() => {
  if (!pipelinePendingDelete.value) return 0
  return playlists.value.filter(
    (playlist) => playlist.pipelineId === pipelinePendingDelete.value!.id,
  ).length
})

const pipelineDeleteMessage = computed(() => {
  if (deleteStagePlaylists.value) {
    return (
      'Stages and the funnel are removed. Linked stage playlists and their album memberships are deleted. ' +
      'Albums stay in your library. In-progress evaluations may restore prior ratings.'
    )
  }
  return (
    'Stages and the funnel are removed. Stage playlists and their albums stay. ' +
    'In-progress evaluations may restore prior ratings.'
  )
})

const existingPipelineNames = computed(() =>
  evaluationPipelines.value.map((pipeline) => pipeline.name),
)

const pipelineGroups = computed(() =>
  evaluationPipelines.value.map((pipeline) => ({
    pipeline,
    playlists: sortPlaylistsByPipelineStages(
      pipelineStages.value.get(pipeline.id) ?? [],
      playlists.value.filter((playlist) => playlist.pipelineId === pipeline.id),
    ),
  })),
)

const regularPlaylists = computed(() =>
  playlists.value.filter((playlist) => !playlist.pipelineId),
)

function playlistStatsFor(playlistId: string): PlaylistStats {
  return (
    playlistStats.value.get(playlistId) ?? {
      albumCount: 0,
      trackCount: 0,
      resolvedAlbumCount: 0,
      resolvedTrackCount: 0,
    }
  )
}

function formatPlaylistCounts(playlistId: string): string {
  const stats = playlistStatsFor(playlistId)
  const albumLabel = stats.albumCount === 1 ? 'album' : 'albums'
  const trackLabel = stats.trackCount === 1 ? 'track' : 'tracks'
  return `${stats.albumCount} ${albumLabel} · ${stats.trackCount} ${trackLabel}`
}

function formatPlaylistResolved(playlistId: string): string | null {
  const stats = playlistStatsFor(playlistId)
  if (stats.albumCount === 0) return null
  return `${stats.resolvedAlbumCount}/${stats.albumCount} resolved`
}

function playlistResolvedClass(playlistId: string): string {
  const stats = playlistStatsFor(playlistId)
  if (stats.albumCount > 0 && stats.resolvedAlbumCount === stats.albumCount) {
    return 'text-emerald-400'
  }
  return 'text-amber-400'
}

function loadFunnelOpenStateFromStorage(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(FUNNEL_OPEN_STATE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'boolean',
      ),
    )
  } catch {
    return {}
  }
}

function persistFunnelOpenState() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(FUNNEL_OPEN_STATE_STORAGE_KEY, JSON.stringify(funnelOpenState.value))
}

function hydrateFunnelOpenStateForPipelines(pipelines: Pipeline[]) {
  const previous = funnelOpenState.value
  const next: Record<string, boolean> = {}
  for (const pipeline of pipelines) {
    // Default closed unless user has explicitly opened it before.
    next[pipeline.id] = previous[pipeline.id] ?? false
  }
  funnelOpenState.value = next
  persistFunnelOpenState()
}

function isFunnelOpen(pipelineId: string): boolean {
  return funnelOpenState.value[pipelineId] ?? false
}

function handleFunnelToggle(pipelineId: string, event: Event) {
  const details = event.currentTarget as HTMLDetailsElement | null
  if (!details) return
  funnelOpenState.value = {
    ...funnelOpenState.value,
    [pipelineId]: details.open,
  }
  persistFunnelOpenState()
}

function setAllFunnelsOpen(open: boolean) {
  const next: Record<string, boolean> = {}
  for (const pipeline of evaluationPipelines.value) {
    next[pipeline.id] = open
  }
  funnelOpenState.value = next
  persistFunnelOpenState()
}

function applyCachedStats(uid: string) {
  const cache = loadPlaylistStatsCache(uid)
  playlistStats.value = playlistStatsMapFromCache(cache)
  statsUpdatedAt.value = cache?.updatedAt ?? null
  return cache !== null
}

async function refreshPlaylistStats(playlistIds: string[]) {
  if (!auth.user) return

  refreshingStats.value = true
  error.value = null
  try {
    const fresh = await getPlaylistStatsMap(auth.user.uid, playlistIds)
    playlistStats.value = fresh
    savePlaylistStatsCache(auth.user.uid, fresh)
    statsUpdatedAt.value = Date.now()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to refresh playlist stats'
  } finally {
    refreshingStats.value = false
  }
}

async function load() {
  if (!auth.user) return

  loading.value = true
  error.value = null

  try {
    const [loadedPlaylists, pipelines] = await Promise.all([
      listPlaylists(auth.user.uid),
      listEvaluationPipelines(auth.user.uid),
    ])
    const stagesEntries = await Promise.all(
      pipelines.map(async (pipeline) => {
        const stages = await listStagesByPipeline(auth.user!.uid, pipeline.id)
        return [pipeline.id, stages] as const
      }),
    )
    playlists.value = loadedPlaylists
    evaluationPipelines.value = pipelines
    pipelineStages.value = new Map(stagesEntries)
    hydrateFunnelOpenStateForPipelines(pipelines)

    const hasCache = applyCachedStats(auth.user.uid)
    loading.value = false

    // First visit: fetch once so resolve counts appear. Later visits use cache + Reload.
    if (!hasCache && loadedPlaylists.length > 0) {
      await refreshPlaylistStats(loadedPlaylists.map((playlist) => playlist.id))
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load playlists'
    loading.value = false
  }
}

async function handleReloadStats() {
  if (!auth.user || refreshingStats.value) return
  await refreshPlaylistStats(playlists.value.map((playlist) => playlist.id))
}

function formatStatsUpdatedAt(): string | null {
  if (!statsUpdatedAt.value) return null
  return new Date(statsUpdatedAt.value).toLocaleString()
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

function requestDeletePlaylist(playlist: Playlist) {
  playlistPendingDelete.value = playlist
}

function cancelDeletePlaylist() {
  if (deletingPlaylistId.value) return
  playlistPendingDelete.value = null
}

async function confirmDeletePlaylist() {
  if (!auth.user || !playlistPendingDelete.value) return

  const playlist = playlistPendingDelete.value
  deletingPlaylistId.value = playlist.id
  error.value = null

  try {
    await deletePlaylist(auth.user.uid, playlist.id)
    playlists.value = playlists.value.filter((item) => item.id !== playlist.id)
    playlistStats.value.delete(playlist.id)
    removePlaylistFromStatsCache(auth.user.uid, playlist.id)
    playlistPendingDelete.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete playlist'
  } finally {
    deletingPlaylistId.value = null
  }
}

function requestDeletePipeline(pipeline: Pipeline) {
  deleteStagePlaylists.value = false
  pipelinePendingDelete.value = pipeline
}

function cancelDeletePipeline() {
  if (deletingPipelineId.value) return
  pipelinePendingDelete.value = null
  deleteStagePlaylists.value = false
}

async function confirmDeletePipeline() {
  if (!auth.user || !pipelinePendingDelete.value) return

  const pipeline = pipelinePendingDelete.value
  deletingPipelineId.value = pipeline.id
  error.value = null

  try {
    await deletePipelineCompletely(auth.user.uid, pipeline.id, {
      deletePlaylists: deleteStagePlaylists.value,
    })
    pipelinePendingDelete.value = null
    deleteStagePlaylists.value = false
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete funnel'
  } finally {
    deletingPipelineId.value = null
  }
}

async function handleSetupComplete() {
  showSetup.value = false
  await load()
}

onMounted(() => {
  funnelOpenState.value = loadFunnelOpenStateFromStorage()
  load()
})
</script>

<template>
  <div>
    <div v-if="!loading && !showSetup" class="mb-6">
      <button
        type="button"
        class="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-muted"
        @click="showSetup = true"
      >
        Set up funnel
      </button>
      <p class="mt-2 max-w-xl text-xs text-text-muted">
        Create a named filter or evaluation funnel and map its stages to playlists.
      </p>
    </div>

    <SetupEvaluationFunnelPanel
      v-if="!loading && showSetup && auth.user"
      :uid="auth.user.uid"
      :playlists="playlists"
      :existing-pipeline-names="existingPipelineNames"
      @complete="handleSetupComplete"
      @cancel="showSetup = false"
    />

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

    <template v-else>
      <div
        v-if="playlists.length"
        class="mb-3 flex flex-wrap items-center gap-2"
      >
        <template v-if="pipelineGroups.length">
          <button
            type="button"
            class="rounded-md border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:bg-white/5 hover:text-text"
            @click="setAllFunnelsOpen(true)"
          >
            Expand all
          </button>
          <button
            type="button"
            class="rounded-md border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:bg-white/5 hover:text-text"
            @click="setAllFunnelsOpen(false)"
          >
            Collapse all
          </button>
        </template>
        <button
          type="button"
          class="rounded-md border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:bg-white/5 hover:text-text disabled:opacity-50"
          :disabled="refreshingStats"
          @click="handleReloadStats"
        >
          {{ refreshingStats ? 'Refreshing…' : 'Reload resolve stats' }}
        </button>
        <span v-if="formatStatsUpdatedAt()" class="text-xs text-text-muted">
          Cached {{ formatStatsUpdatedAt() }}
        </span>
      </div>

      <section v-for="group in pipelineGroups" :key="group.pipeline.id" class="mb-6">
        <details
          :open="isFunnelOpen(group.pipeline.id)"
          class="rounded-xl border border-emerald-500/25 bg-emerald-500/5"
          @toggle="handleFunnelToggle(group.pipeline.id, $event)"
        >
          <summary
            class="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-medium text-emerald-100 marker:content-none [&::-webkit-details-marker]:hidden"
          >
            <span class="min-w-0">
              <span>{{ group.pipeline.name }}</span>
              <span class="ml-2 text-xs font-normal text-emerald-200/80">
                {{ group.playlists.length }} stage playlist{{ group.playlists.length === 1 ? '' : 's' }}
              </span>
            </span>
            <button
              type="button"
              class="shrink-0 rounded-lg border border-emerald-500/30 px-2.5 py-1 text-xs font-normal text-emerald-100/90 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-50"
              :disabled="deletingPipelineId === group.pipeline.id"
              @click.stop.prevent="requestDeletePipeline(group.pipeline)"
            >
              {{ deletingPipelineId === group.pipeline.id ? 'Deleting…' : 'Delete funnel' }}
            </button>
          </summary>
          <ul class="divide-y divide-border border-t border-emerald-500/15">
            <li
              v-for="playlist in group.playlists"
              :key="playlist.id"
              class="flex items-center justify-between gap-4 px-4 py-3"
            >
              <RouterLink
                :to="{ name: 'playlist-detail', params: { id: playlist.id } }"
                class="min-w-0 flex-1 transition-colors hover:text-accent"
              >
                <span class="font-medium">{{ playlist.name }}</span>
                <span class="mt-0.5 block text-xs text-text-muted">
                  {{ formatPlaylistCounts(playlist.id) }}
                  <template v-if="formatPlaylistResolved(playlist.id)">
                    ·
                    <span :class="playlistResolvedClass(playlist.id)">
                      {{ formatPlaylistResolved(playlist.id) }}
                    </span>
                  </template>
                  · Updated {{ playlist.updatedAt.toLocaleDateString() }}
                </span>
              </RouterLink>
              <button
                type="button"
                class="shrink-0 text-sm text-text-muted transition-colors hover:text-red-300"
                @click="requestDeletePlaylist(playlist)"
              >
                Delete
              </button>
            </li>
          </ul>
        </details>
      </section>

      <p v-if="!playlists.length" class="text-sm text-text-muted">
        No playlists yet. Create one above, then add albums from your library.
      </p>

      <section v-else-if="regularPlaylists.length">
        <h3 v-if="pipelineGroups.length" class="mb-3 text-sm font-medium text-text-muted">
          Other playlists
        </h3>
        <ul class="divide-y divide-border rounded-xl border border-border">
          <li
            v-for="playlist in regularPlaylists"
            :key="playlist.id"
            class="flex items-center justify-between gap-4 px-4 py-3"
          >
            <RouterLink
              :to="{ name: 'playlist-detail', params: { id: playlist.id } }"
              class="min-w-0 flex-1 transition-colors hover:text-accent"
            >
              <span class="font-medium">{{ playlist.name }}</span>
              <span class="mt-0.5 block text-xs text-text-muted">
                {{ formatPlaylistCounts(playlist.id) }}
                <template v-if="formatPlaylistResolved(playlist.id)">
                  ·
                  <span :class="playlistResolvedClass(playlist.id)">
                    {{ formatPlaylistResolved(playlist.id) }}
                  </span>
                </template>
                · Updated {{ playlist.updatedAt.toLocaleDateString() }}
              </span>
            </RouterLink>
            <button
              type="button"
              class="shrink-0 text-sm text-text-muted transition-colors hover:text-red-300"
              @click="requestDeletePlaylist(playlist)"
            >
              Delete
            </button>
          </li>
        </ul>
      </section>
    </template>

    <ConfirmDialog
      :open="pipelinePendingDelete !== null"
      :title="pipelinePendingDelete ? `Delete funnel “${pipelinePendingDelete.name}”?` : ''"
      :message="pipelineDeleteMessage"
      confirm-label="Delete funnel"
      destructive
      :busy="deletingPipelineId !== null"
      @confirm="confirmDeletePipeline"
      @cancel="cancelDeletePipeline"
    >
      <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
        <input
          v-model="deleteStagePlaylists"
          type="checkbox"
          class="mt-0.5"
          :disabled="deletingPipelineId !== null"
        />
        <span>
          Also delete
          {{ pipelineDeleteStageCount }}
          stage playlist{{ pipelineDeleteStageCount === 1 ? '' : 's' }}
          <span class="mt-0.5 block text-xs text-text-muted">
            Useful for throwaway test funnels. Albums remain in your library.
          </span>
        </span>
      </label>
    </ConfirmDialog>

    <ConfirmDialog
      :open="playlistPendingDelete !== null"
      :title="playlistPendingDelete ? `Delete playlist “${playlistPendingDelete.name}”?` : ''"
      message="This removes the playlist and its album memberships. Albums stay in your library."
      confirm-label="Delete playlist"
      destructive
      :busy="deletingPlaylistId !== null"
      @confirm="confirmDeletePlaylist"
      @cancel="cancelDeletePlaylist"
    />
  </div>
</template>
