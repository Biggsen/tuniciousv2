<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import ArtistAvatar from '@/components/artist/ArtistAvatar.vue'
import { pickAlbumCoverSmall } from '@/lib/album/coverArt'
import type { LibraryAlbumCard } from '@/lib/album/firestore'
import { matchesLibrarySearch } from '@/lib/library/search'
import { loadUnresolvedOnlyFilter, saveUnresolvedOnlyFilter } from '@/lib/library/persist'
import {
  albumLibraryCardClasses,
  albumResolveStatus,
} from '@/lib/youtube/albumResolve'
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import { usePlaybackStore } from '@/stores/playback'

type LibrarySearchMode = 'album' | 'artist'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const library = useLibraryStore()
const playback = usePlaybackStore()

const query = ref('')
const bootstrapping = ref(true)
const mode = ref<LibrarySearchMode>(
  route.query.mode === 'artist' ? 'artist' : 'album',
)
const unresolvedOnly = ref(loadUnresolvedOnlyFilter())

watch(unresolvedOnly, (value) => {
  saveUnresolvedOnlyFilter(value)
})

function syncModeToRoute(next: LibrarySearchMode) {
  const current = route.query.mode === 'artist' ? 'artist' : 'album'
  if (current === next) return
  void router.replace({
    name: 'library',
    query: next === 'artist' ? { mode: 'artist' } : {},
  })
}

watch(mode, (value) => {
  syncModeToRoute(value)
  if (value === 'artist' && auth.user) {
    void library.ensureArtists(auth.user.uid)
  }
})

watch(
  () => route.query.mode,
  (value) => {
    const next: LibrarySearchMode = value === 'artist' ? 'artist' : 'album'
    if (mode.value !== next) mode.value = next
  },
)

const loading = computed(
  () =>
    bootstrapping.value ||
    library.albumsLoading ||
    (mode.value === 'artist' && library.artistsLoading && library.artists.length === 0),
)

const filteredAlbums = computed(() => {
  let list = library.cards.filter((album) =>
    matchesLibrarySearch(query.value, album.title, album.artist, album.albumYear),
  )

  if (unresolvedOnly.value) {
    list = list.filter((album) => albumResolveStatus(album, library.mappings) !== 'resolved')
  }

  return list
})

const filteredArtists = computed(() =>
  library.artists.filter((artist) =>
    matchesLibrarySearch(query.value, artist.name, artist.sortName, artist.scrobbleName),
  ),
)

const hasLibrary = computed(() => library.cards.length > 0 || library.artists.length > 0)
const showEmpty = computed(
  () => !loading.value && !library.error && !hasLibrary.value,
)

const showNoResults = computed(() => {
  if (loading.value || library.error) return false
  if (mode.value === 'album') {
    return filteredAlbums.value.length === 0 && (query.value.trim() || unresolvedOnly.value)
  }
  if (!query.value.trim()) return false
  return !filteredArtists.value.length
})

const noResultsMessage = computed(() => {
  if (mode.value !== 'album') {
    return `No artists match "${query.value.trim()}".`
  }
  if (query.value.trim() && unresolvedOnly.value) {
    return `No unresolved albums match "${query.value.trim()}".`
  }
  if (unresolvedOnly.value) return 'No unresolved albums.'
  return `No albums match "${query.value.trim()}".`
})

function resolveStatus(album: LibraryAlbumCard) {
  return albumResolveStatus(album, library.mappings)
}

function isPlayingAlbum(albumId: string): boolean {
  if (!playback.showPlayerBar) return false
  return playback.currentItem?.albumId === albumId
}

const scrollPaddingClass = computed(() => {
  if (playback.showPlayerBar) {
    return 'pb-44 md:pb-24'
  }
  return 'max-md:pb-20 md:pb-6'
})

onMounted(async () => {
  if (!auth.user) {
    bootstrapping.value = false
    return
  }

  try {
    await library.ensureAlbums(auth.user.uid)
    if (mode.value === 'artist') {
      await library.ensureArtists(auth.user.uid)
    }
  } catch {
    // Error surfaced via library.error
  } finally {
    bootstrapping.value = false
  }
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <template v-if="hasLibrary && !loading && !library.error">
      <div
        class="flex shrink-0 flex-col gap-4 border-b border-border bg-surface px-4 py-4 lg:flex-row lg:items-center lg:justify-between md:px-8"
      >
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm transition-colors"
            :class="
              mode === 'album'
                ? 'bg-accent/15 text-text'
                : 'text-text-muted hover:bg-white/5 hover:text-text'
            "
            @click="mode = 'album'"
          >
            Albums
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm transition-colors"
            :class="
              mode === 'artist'
                ? 'bg-accent/15 text-text'
                : 'text-text-muted hover:bg-white/5 hover:text-text'
            "
            @click="mode = 'artist'"
          >
            Artists
          </button>
          <button
            v-if="mode === 'album'"
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm transition-colors"
            :class="
              unresolvedOnly
                ? 'bg-amber-500/15 text-amber-100'
                : 'text-text-muted hover:bg-white/5 hover:text-text'
            "
            @click="unresolvedOnly = !unresolvedOnly"
          >
            Unresolved only
          </button>
        </div>

        <input
          v-model="query"
          type="search"
          class="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50"
          :placeholder="mode === 'album' ? 'Filter albums or artists…' : 'Filter artists…'"
        />
      </div>

      <div
        class="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6"
        :class="scrollPaddingClass"
      >
        <p v-if="showNoResults" class="text-sm text-text-muted">
          {{ noResultsMessage }}
        </p>

        <ul
          v-else-if="mode === 'album'"
          class="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        >
          <li v-for="album in filteredAlbums" :key="album.id">
            <RouterLink
              :to="{ name: 'album-detail', params: { id: album.id } }"
              class="group flex h-full flex-col overflow-hidden rounded-xl border transition-colors"
              :class="albumLibraryCardClasses(resolveStatus(album), isPlayingAlbum(album.id))"
            >
              <div class="aspect-square w-full overflow-hidden bg-surface/80">
                <img
                  v-if="pickAlbumCoverSmall(album)"
                  :src="pickAlbumCoverSmall(album)"
                  :alt="album.title"
                  loading="lazy"
                  decoding="async"
                  class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                />
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center text-xs text-text-muted"
                >
                  No art
                </div>
              </div>
              <div class="flex flex-1 flex-col p-3">
                <p
                  class="line-clamp-2 text-sm font-medium leading-snug"
                  :class="isPlayingAlbum(album.id) ? 'text-accent' : ''"
                >{{ album.title }}</p>
                <p class="mt-1 truncate text-xs text-text-muted">{{ album.artist }}</p>
                <p v-if="album.albumYear" class="mt-1 text-[11px] text-text-muted/70">
                  {{ album.albumYear }}
                </p>
              </div>
            </RouterLink>
          </li>
        </ul>

        <ul v-else class="divide-y divide-border rounded-xl border border-border">
          <li v-for="artist in filteredArtists" :key="artist.id">
            <RouterLink
              :to="{
                name: 'artist-detail',
                params: { id: artist.id },
                query: { mode: 'artist' },
              }"
              class="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/5"
            >
              <ArtistAvatar :artist="artist" size="sm" rounded="full" />
              <span class="font-medium">{{ artist.name }}</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </template>

    <div
      v-else
      class="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6"
      :class="scrollPaddingClass"
    >
      <p v-if="showEmpty" class="text-sm text-text-muted">
        No albums yet. Browse the
        <RouterLink to="/explorer" class="text-accent hover:underline">Explorer</RouterLink>
        and import a release, or
        <RouterLink to="/import" class="text-accent hover:underline">import from a Spotify export</RouterLink>.
      </p>

      <ExplorerLoading v-else-if="loading" />
      <ExplorerError v-else-if="library.error" :message="library.error" />
    </div>
  </div>
</template>
