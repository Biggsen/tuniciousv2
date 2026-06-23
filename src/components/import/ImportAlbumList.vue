<script setup lang="ts">
import type { StagedAlbum } from '@/lib/import/types'

defineProps<{
  albums: StagedAlbum[]
  selectedId: string | null
  sourceLabel: string | null
  pendingCount: number
  inLibraryCount: number
  importedCount: number
}>()

const emit = defineEmits<{
  select: [albumId: string]
}>()

function statusLabel(album: StagedAlbum): string {
  if (album.status === 'imported') return 'Imported'
  if (album.status === 'in-library') return 'In library'
  return 'Pending'
}

function statusClass(album: StagedAlbum): string {
  if (album.status === 'imported') {
    return 'bg-emerald-500/15 text-emerald-300'
  }
  if (album.status === 'in-library') {
    return 'bg-sky-500/15 text-sky-300'
  }
  return 'bg-white/10 text-text-muted'
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col rounded-xl border border-border bg-surface-raised/40">
    <div class="border-b border-border px-4 py-3">
      <h2 class="text-sm font-medium">Albums from export</h2>
      <p v-if="sourceLabel" class="mt-1 truncate text-xs text-text-muted">{{ sourceLabel }}</p>
      <p class="mt-1 text-xs text-text-muted">
        {{ pendingCount }} to import
        <template v-if="inLibraryCount"> · {{ inLibraryCount }} in library</template>
        <template v-if="importedCount"> · {{ importedCount }} imported</template>
      </p>
    </div>

    <p v-if="!albums.length" class="p-4 text-sm text-text-muted">
      No albums left to import from this export.
    </p>

    <ul v-else class="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
      <li v-for="album in albums" :key="album.id">
        <button
          type="button"
          class="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors"
          :class="selectedId === album.id ? 'bg-accent/10' : 'hover:bg-white/5'"
          @click="emit('select', album.id)"
        >
          <div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface">
            <img
              v-if="album.imageUrl"
              :src="album.imageUrl"
              :alt="album.albumName"
              loading="lazy"
              decoding="async"
              class="h-full w-full object-cover"
            />
            <div
              v-else
              class="flex h-full w-full items-center justify-center text-[10px] text-text-muted"
            >
              No art
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ album.albumName }}</p>
            <p class="mt-0.5 truncate text-xs text-text-muted">{{ album.albumArtist }}</p>
            <p class="mt-1 text-[11px] text-text-muted">
              {{ album.tracks.length }} tracks
              <template v-if="album.releaseDate"> · {{ album.releaseDate.slice(0, 4) }}</template>
            </p>
          </div>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            :class="statusClass(album)"
          >
            {{ statusLabel(album) }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
