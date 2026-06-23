<script setup lang="ts">
import { computed, ref } from 'vue'

import { listAlbums } from '@/lib/album/firestore'
import type { Album } from '@/types/library'

const props = defineProps<{
  uid: string
  memberAlbumIds: string[]
}>()

const emit = defineEmits<{
  add: [albumId: string]
}>()

const open = ref(false)
const loading = ref(false)
const albums = ref<Album[]>([])
const error = ref<string | null>(null)

const availableAlbums = computed(() =>
  albums.value.filter((album) => !props.memberAlbumIds.includes(album.id)),
)

async function loadAlbums() {
  loading.value = true
  error.value = null
  try {
    albums.value = await listAlbums(props.uid)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load library'
  } finally {
    loading.value = false
  }
}

async function toggle() {
  open.value = !open.value
  if (open.value && !albums.value.length) {
    await loadAlbums()
  }
}

async function addAlbum(albumId: string) {
  emit('add', albumId)
}
</script>

<template>
  <div>
    <button
      type="button"
      class="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-white/5"
      @click="toggle"
    >
      {{ open ? 'Hide library' : 'Add from library' }}
    </button>

    <div
      v-if="open"
      class="mt-4 rounded-xl border border-border bg-surface-raised/50 p-4"
    >
      <p v-if="loading" class="text-sm text-text-muted">Loading library…</p>
      <p v-else-if="error" class="text-sm text-red-300">{{ error }}</p>
      <p v-else-if="!availableAlbums.length" class="text-sm text-text-muted">
        No more albums to add. Import albums from the Explorer first.
      </p>

      <ul v-else class="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        <li v-for="album in availableAlbums" :key="album.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
            @click="addAlbum(album.id)"
          >
            <div class="h-10 w-10 shrink-0 overflow-hidden rounded bg-surface">
              <img
                v-if="album.coverUrl"
                :src="album.coverUrl"
                :alt="album.title"
                class="h-full w-full object-cover"
              />
            </div>
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ album.title }}</span>
              <span class="block truncate text-xs text-text-muted">{{ album.artist }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
