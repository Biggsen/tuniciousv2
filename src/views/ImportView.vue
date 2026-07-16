<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'

import ImportAlbumList from '@/components/import/ImportAlbumList.vue'
import ImportMatchPanel from '@/components/import/ImportMatchPanel.vue'
import {
  defaultStageIdFromMap,
  listAvailableFunnelGroups,
  loadV1PlaylistMap,
  resolveV1UidForV2User,
  stagesFromPlaylistMap,
  type V1FunnelGroup,
  type V1RepoStageOption,
} from '@/lib/import/v1ExportRepo'
import {
  loadV1ImportSelection,
  saveV1ImportSelection,
} from '@/lib/import/persistV1Selection'
import { useAuthStore } from '@/stores/auth'
import { useImportStore } from '@/stores/import'

const auth = useAuthStore()
const importStore = useImportStore()
const {
  albums,
  selectedId,
  sourceLabel,
  parseError,
  parsing,
  matchingLibrary,
  showInLibrary,
  selectedAlbum,
  inLibraryAlbums,
  importedCount,
  pendingCount,
  skippedCount,
  displayedAlbums,
  playlists,
  syncPlaylistId,
  autoDetectedPlaylistId,
  syncPlaylist,
  syncError,
  syncingInLibrary,
  syncableAlbums,
  automationEnabled,
  importSource,
} = storeToRefs(importStore)

const sortedPlaylists = computed(() =>
  [...playlists.value].sort((a, b) => a.name.localeCompare(b.name)),
)

const v1Uid = ref<string | null>(null)
const v1Groups = ref<V1FunnelGroup[]>([])
const v1Group = ref<V1FunnelGroup>('new')
const v1Stages = ref<V1RepoStageOption[]>([])
const v1StageId = ref<string | null>(null)
const v1SetupError = ref<string | null>(null)
const v1SetupLoading = ref(false)

const selectedV1Stage = computed(
  () => v1Stages.value.find((stage) => stage.v1PlaylistId === v1StageId.value) ?? null,
)

const openAlbumCountHint = computed(() => {
  const stage = selectedV1Stage.value
  if (!stage) return null
  return stage.name
})

async function refreshV1Stages(preferredStageId?: string | null) {
  if (!v1Uid.value) return
  v1SetupLoading.value = true
  v1SetupError.value = null
  try {
    const map = await loadV1PlaylistMap(v1Uid.value, v1Group.value)
    v1Stages.value = stagesFromPlaylistMap(map)
    const preferred =
      preferredStageId &&
      v1Stages.value.some((stage) => stage.v1PlaylistId === preferredStageId)
        ? preferredStageId
        : null
    v1StageId.value = preferred ?? defaultStageIdFromMap(v1Stages.value)
  } catch (err) {
    v1Stages.value = []
    v1StageId.value = null
    v1SetupError.value = err instanceof Error ? err.message : 'Failed to load playlist map'
  } finally {
    v1SetupLoading.value = false
  }
}

function persistV1Selection() {
  const uid = auth.user?.uid
  if (!uid || !v1StageId.value) return
  saveV1ImportSelection(uid, { group: v1Group.value, stageId: v1StageId.value })
}

async function setupV1Export() {
  v1SetupLoading.value = true
  v1SetupError.value = null
  v1Uid.value = null
  v1Groups.value = []
  v1Stages.value = []
  v1StageId.value = null

  try {
    const uid = auth.user?.uid
    if (!uid) {
      v1SetupError.value = 'Sign in to use the repo v1 export.'
      return
    }

    const resolved = await resolveV1UidForV2User(uid)
    if (!resolved) {
      v1SetupError.value = 'No v1 export mapped for this account (uid-map.json).'
      return
    }

    v1Uid.value = resolved
    const groups = await listAvailableFunnelGroups(resolved)
    if (!groups.length) {
      v1SetupError.value = 'No playlist-id-map files found for this v1 user.'
      return
    }

    v1Groups.value = groups
    const saved = loadV1ImportSelection(uid)
    const preferredGroup =
      saved && groups.includes(saved.group) ? saved.group : groups.includes('new') ? 'new' : groups[0]
    v1Group.value = preferredGroup
    await refreshV1Stages(saved?.group === preferredGroup ? saved.stageId : null)
  } catch (err) {
    v1SetupError.value = err instanceof Error ? err.message : 'Failed to set up v1 export'
  } finally {
    v1SetupLoading.value = false
  }
}

async function selectV1Group(group: V1FunnelGroup) {
  if (v1Group.value === group) return
  v1Group.value = group
  const uid = auth.user?.uid
  const saved = uid ? loadV1ImportSelection(uid) : null
  await refreshV1Stages(saved?.group === group ? saved.stageId : null)
  persistV1Selection()
}

onMounted(() => {
  void setupV1Export()
})

watch(
  () => auth.user?.uid,
  () => {
    if (!albums.value.length) void setupV1Export()
  },
)

watch(v1StageId, (stageId) => {
  if (stageId) persistV1Selection()
})

function handleSyncPlaylistChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  importStore.setSyncPlaylistId(value || null)
}

function handleFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  void importStore.loadFiles([...files])
  input.value = ''
}

async function loadV1FromRepo() {
  if (!v1StageId.value) return
  persistV1Selection()
  await importStore.loadV1FromRepo(v1Group.value, v1StageId.value)
}

function handleClearSession() {
  importStore.clearSession()
  void setupV1Export()
}
</script>

<template>
  <div>
    <p class="mb-6 max-w-2xl text-sm text-text-muted">
      Import albums into your library from an Exportify CSV (with track comparison) or the repo v1
      pipeline export (title / artist / year — good for backlog stages like Queued). Albums already
      in your library are skipped. Optionally sync imports to a playlist.
    </p>

    <div
      v-if="!albums.length"
      class="grid gap-4 lg:grid-cols-2"
    >
      <div class="rounded-xl border border-dashed border-border bg-surface-raised/30 p-6">
        <label class="flex cursor-pointer flex-col items-center gap-3 text-center">
          <span class="text-sm font-medium">Exportify CSV</span>
          <span class="max-w-md text-xs text-text-muted">
            Spotify playlist exports with tracklists. Compare against MusicBrainz editions, then
            import.
          </span>
          <span
            class="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted"
          >
            {{ parsing && importSource !== 'v1' ? 'Parsing…' : 'Select CSV file(s)' }}
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            class="sr-only"
            :disabled="parsing || v1SetupLoading"
            @change="handleFiles"
          />
        </label>
      </div>

      <div class="rounded-xl border border-dashed border-border bg-surface-raised/30 p-6">
        <div class="flex flex-col items-center gap-3 text-center">
          <span class="text-sm font-medium">v1 export (repo)</span>
          <span class="max-w-md text-xs text-text-muted">
            Uses the mapped export for your account. Pick a funnel stage from
            <code class="text-text">playlist-id-map</code> (remembers your last stage). No Spotify
            tracklist — match by title, artist, year.
          </span>

          <p v-if="v1SetupLoading" class="text-xs text-text-muted">Loading export mapping…</p>
          <p v-else-if="v1Uid" class="font-mono text-xs text-text-muted">
            v1 {{ v1Uid.slice(0, 8) }}…
          </p>

          <div v-if="v1Groups.length > 1" class="flex gap-2">
            <button
              v-for="group in v1Groups"
              :key="group"
              type="button"
              class="rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors"
              :class="
                v1Group === group
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-text-muted hover:bg-white/5'
              "
              @click="selectV1Group(group)"
            >
              {{ group }}
            </button>
          </div>
          <p v-else-if="v1Groups.length === 1" class="text-xs text-text-muted capitalize">
            Funnel: {{ v1Groups[0] }}
          </p>

          <label v-if="v1Stages.length" class="mt-1 w-full max-w-xs text-left text-sm">
            <span class="mb-1 block text-xs text-text-muted">Stage</span>
            <select
              v-model="v1StageId"
              class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option
                v-for="stage in v1Stages"
                :key="stage.v1PlaylistId"
                :value="stage.v1PlaylistId"
              >
                {{ stage.name }}
                <template v-if="stage.pipelineRole"> · {{ stage.pipelineRole }}</template>
              </option>
            </select>
          </label>

          <p v-if="selectedV1Stage?.v2PlaylistId" class="text-xs text-emerald-200/90">
            Sync target: mapped v2 playlist for {{ openAlbumCountHint }}
          </p>

          <button
            v-if="v1StageId"
            type="button"
            class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
            :disabled="parsing || v1SetupLoading"
            @click="loadV1FromRepo"
          >
            {{ parsing ? 'Loading…' : `Load ${selectedV1Stage?.name ?? 'stage'}` }}
          </button>
        </div>
      </div>

      <p
        v-if="parseError || v1SetupError"
        class="text-center text-sm text-red-300 lg:col-span-2"
      >
        {{ parseError || v1SetupError }}
      </p>
    </div>

    <template v-else>
      <p
        v-if="matchingLibrary"
        class="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100"
      >
        Matching albums against your library…
      </p>

      <details
        v-if="inLibraryAlbums.length"
        class="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100"
      >
        <summary class="cursor-pointer font-medium marker:text-sky-300">
          {{ inLibraryAlbums.length }} album{{ inLibraryAlbums.length === 1 ? '' : 's' }} already in
          your library
        </summary>
        <p class="mt-2 text-xs text-sky-200/80">
          Matched by title and artist. These are hidden from the list below.
        </p>
        <ul class="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
          <li v-for="album in inLibraryAlbums" :key="album.id">
            <RouterLink
              v-if="album.libraryAlbumId"
              :to="{ name: 'album-detail', params: { id: album.libraryAlbumId } }"
              class="text-accent hover:underline"
            >
              {{ album.albumName }}
            </RouterLink>
            <span v-else>{{ album.albumName }}</span>
            <span class="text-sky-200/70"> · {{ album.albumArtist }}</span>
          </li>
        </ul>
      </details>

      <section class="mb-4 rounded-xl border border-border bg-surface-raised/40 px-4 py-3">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-medium">Playlist sync</h3>
            <p
              v-if="autoDetectedPlaylistId && syncPlaylistId === autoDetectedPlaylistId && syncPlaylist"
              class="mt-1 text-xs text-emerald-200/90"
            >
              Matched <strong>{{ syncPlaylist.name }}</strong>
              {{
                importSource === 'v1'
                  ? ' from playlist-id-map'
                  : ' from the CSV filename'
              }}.
            </p>
            <p v-else class="mt-1 text-xs text-text-muted">
              Optional — assign imported albums to a playlist. Leave unset for library only.
            </p>
          </div>
          <label class="min-w-[12rem] shrink-0 text-sm">
            <span class="mb-1 block text-xs text-text-muted">Target playlist</span>
            <select
              :value="syncPlaylistId ?? ''"
              class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              @change="handleSyncPlaylistChange"
            >
              <option value="">None — library only</option>
              <option v-for="playlist in sortedPlaylists" :key="playlist.id" :value="playlist.id">
                {{ playlist.name }}
              </option>
            </select>
          </label>
        </div>

        <p v-if="syncPlaylist" class="mt-3 text-xs text-text-muted">
          New imports will also be added to <strong class="text-text">{{ syncPlaylist.name }}</strong>.
        </p>

        <div
          v-if="syncPlaylist && syncableAlbums.length"
          class="mt-3 flex flex-wrap items-center gap-3"
        >
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
            :disabled="syncingInLibrary"
            @click="importStore.syncInLibraryAlbums()"
          >
            {{
              syncingInLibrary
                ? 'Adding…'
                : `Add ${syncableAlbums.length} album${syncableAlbums.length === 1 ? '' : 's'} already in library`
            }}
          </button>
          <span class="text-xs text-text-muted">
            Includes albums from this session that are already in your library.
          </span>
        </div>

        <p v-if="syncError" class="mt-3 text-sm text-red-300">{{ syncError }}</p>
      </section>

      <p
        v-if="automationEnabled"
        class="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
      >
        <template v-if="importSource === 'v1'">
          Automation running — title/artist/year matches are imported automatically; otherwise the
          queue advances to the next album.
        </template>
        <template v-else>
          Automation running — 100% ISRC or title-search matches are imported automatically;
          otherwise the queue advances to the next album.
        </template>
      </p>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-text-muted">
          {{ pendingCount }} to import
          <template v-if="inLibraryAlbums.length">
            · {{ inLibraryAlbums.length }} in library
          </template>
          <template v-if="importedCount"> · {{ importedCount }} imported this session</template>
          <template v-if="skippedCount"> · {{ skippedCount }} skipped</template>
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-if="!automationEnabled && pendingCount > 0"
            type="button"
            class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
            :disabled="matchingLibrary"
            @click="importStore.startAutomation()"
          >
            Start automation
          </button>
          <button
            v-else-if="automationEnabled"
            type="button"
            class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/20"
            @click="importStore.stopAutomation()"
          >
            Stop automation
          </button>
          <label
            v-if="inLibraryAlbums.length"
            class="flex cursor-pointer items-center gap-2 text-sm text-text-muted"
          >
            <input v-model="showInLibrary" type="checkbox" class="rounded border-border" />
            Show albums already in library
          </label>
          <label
            v-if="importSource !== 'v1'"
            class="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5"
          >
            Add more files
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              class="sr-only"
              @change="handleFiles"
            />
          </label>
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text"
            @click="handleClearSession"
          >
            Clear
          </button>
        </div>
      </div>

      <div class="grid min-h-[32rem] gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <ImportAlbumList
          :albums="displayedAlbums"
          :selected-id="selectedId"
          :source-label="sourceLabel"
          :pending-count="pendingCount"
          :in-library-count="inLibraryAlbums.length"
          :imported-count="importedCount"
          @select="importStore.selectAlbum($event)"
        />
        <ImportMatchPanel
          :album="selectedAlbum"
          @imported="importStore.handleImported($event)"
          @skip="importStore.skipAlbum($event)"
        />
      </div>
    </template>
  </div>
</template>
