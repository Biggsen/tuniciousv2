<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import {
  listAlbumPickerItems,
  type AlbumPickerCursor,
  type AlbumPickerItem,
} from '@/lib/album/firestore'
import { pickAlbumCoverSmall } from '@/lib/album/coverArt'

const props = defineProps<{
  uid: string
  memberAlbumIds: string[]
}>()

const emit = defineEmits<{
  add: [albumId: string]
}>()

const open = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const albums = ref<AlbumPickerItem[]>([])
const nextCursor = ref<AlbumPickerCursor | undefined>(undefined)
const search = ref('')
const debouncedSearch = ref('')
const hasSearched = ref(false)
const error = ref<string | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | undefined

const availableAlbums = computed(() =>
  albums.value.filter((album) => !props.memberAlbumIds.includes(album.id)),
)

const hasMore = computed(() => Boolean(nextCursor.value) && !debouncedSearch.value)

function yearLabel(album: AlbumPickerItem): string {
  return album.albumYear?.trim() || 'Unknown year'
}

async function loadAlbums(options?: { reset?: boolean }) {
  const reset = options?.reset ?? false
  if (reset) {
    albums.value = []
    nextCursor.value = undefined
    hasSearched.value = debouncedSearch.value.length > 0
  }

  if (albums.value.length === 0) {
    loading.value = true
  } else {
    loadingMore.value = true
  }
  error.value = null

  try {
    const result = await listAlbumPickerItems(props.uid, {
      search: debouncedSearch.value || undefined,
      cursor: reset ? undefined : nextCursor.value,
      limit: 40,
    })
    albums.value = reset ? result.items : [...albums.value, ...result.items]
    nextCursor.value = result.nextCursor
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load library'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

watch(search, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedSearch.value = value.trim().toLowerCase()
  }, 200)
})

watch(debouncedSearch, async () => {
  if (!open.value) return
  await loadAlbums({ reset: true })
})

async function toggle() {
  open.value = !open.value
  if (open.value && !albums.value.length) {
    await loadAlbums({ reset: true })
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value) return
  await loadAlbums()
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
      <div class="mb-3">
        <input
          v-model="search"
          type="text"
          placeholder="Search by title or artist"
          class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <p v-if="loading" class="text-sm text-text-muted">Loading library…</p>
      <p v-else-if="error" class="text-sm text-red-300">{{ error }}</p>
      <p v-else-if="!availableAlbums.length" class="text-sm text-text-muted">
        <span v-if="hasSearched">No albums match this search.</span>
        <template v-else>
          No more albums to add. Import albums from the
          <RouterLink to="/library" class="text-accent hover:underline">library</RouterLink>
          first.
        </template>
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
                v-if="pickAlbumCoverSmall(album)"
                :src="pickAlbumCoverSmall(album)"
                :alt="album.title"
                class="h-full w-full object-cover"
              />
            </div>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ album.title }}</span>
              <span class="block truncate text-xs text-text-muted">
                {{ album.artist }} · {{ yearLabel(album) }}
              </span>
            </span>
          </button>
        </li>
      </ul>
      <div v-if="hasMore" class="mt-3">
        <button
          type="button"
          class="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:bg-white/5 disabled:opacity-50"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>
  </div>
</template>
