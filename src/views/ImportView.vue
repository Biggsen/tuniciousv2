<script setup lang="ts">
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
  showInLibrary,
  selectedAlbum,
  inLibraryAlbums,
  importedCount,
  pendingCount,
  skippedCount,
  displayedAlbums,
} = storeToRefs(importStore)

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

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-text-muted">
          {{ pendingCount }} to import
          <template v-if="inLibraryAlbums.length">
            · {{ inLibraryAlbums.length }} in library
          </template>
          <template v-if="importedCount"> · {{ importedCount }} imported this session</template>
          <template v-if="skippedCount"> · {{ skippedCount }} skipped</template>
        </p>
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
          @imported="importStore.markImported($event.albumUri, $event.libraryAlbumId)"
          @skip="importStore.skipAlbum($event)"
        />
      </div>
    </template>
  </div>
</template>
