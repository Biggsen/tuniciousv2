<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'

import ImportAlbumList from '@/components/import/ImportAlbumList.vue'
import ImportMatchPanel from '@/components/import/ImportMatchPanel.vue'
import { useImportStore } from '@/stores/import'

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
} = storeToRefs(importStore)

const sortedPlaylists = computed(() =>
  [...playlists.value].sort((a, b) => a.name.localeCompare(b.name)),
)

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
</script>

<template>
  <div>
    <p class="mb-6 max-w-2xl text-sm text-text-muted">
      Import albums from a Spotify playlist export (Exportify CSV). Choose one or more CSV files —
      albums are deduplicated by Spotify album ID. Albums already in your library are skipped
      automatically. Match the rest against MusicBrainz, compare tracklists, then import.
      When a single CSV matches one of your playlists, albums can be added to that playlist as well.
    </p>

    <div v-if="!albums.length" class="rounded-xl border border-dashed border-border bg-surface-raised/30 p-8">
      <label class="flex cursor-pointer flex-col items-center gap-3 text-center">
        <span class="text-3xl">📂</span>
        <span class="text-sm font-medium">Choose Exportify CSV file(s)</span>
        <span class="max-w-md text-xs text-text-muted">
          Each file is one playlist. Multiple files are merged and deduplicated by album.
        </span>
        <span
          class="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted"
        >
          {{ parsing ? 'Parsing…' : 'Select files' }}
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          class="sr-only"
          :disabled="parsing"
          @change="handleFiles"
        />
      </label>

      <p v-if="parseError" class="mt-4 text-center text-sm text-red-300">{{ parseError }}</p>
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
              Matched <strong>{{ syncPlaylist.name }}</strong> from the CSV filename.
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
            Includes albums matched from this CSV that are already in your library.
          </span>
        </div>

        <p v-if="syncError" class="mt-3 text-sm text-red-300">{{ syncError }}</p>
      </section>

      <p
        v-if="automationEnabled"
        class="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
      >
        Automation running — 100% ISRC or title-search matches are imported automatically; otherwise the queue advances to the next album.
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
          <label class="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5">
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
            @click="importStore.clearSession()"
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
