<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import ArtistAvatar from '@/components/artist/ArtistAvatar.vue'
import { pickAlbumCoverSmall } from '@/lib/album/coverArt'
import { listAlbums } from '@/lib/album/firestore'
import { listArtists } from '@/lib/artist/firestore'
import { matchesLibrarySearch } from '@/lib/library/search'
import { loadUnresolvedOnlyFilter, saveUnresolvedOnlyFilter } from '@/lib/library/persist'
import {
  albumLibraryCardClasses,
  albumResolveStatus,
} from '@/lib/youtube/albumResolve'
import { getMappingsForTrackIds } from '@/lib/youtube/firestore'
import { useAuthStore } from '@/stores/auth'
import { usePlaybackStore } from '@/stores/playback'
import type { Album, Artist } from '@/types/library'
import type { TrackYouTubeMapping } from '@/types/youtube'

type LibrarySearchMode = 'album' | 'artist'

const auth = useAuthStore()
const playback = usePlaybackStore()

const albums = ref<Album[]>([])
const artists = ref<Artist[]>([])
const mappings = ref<Map<string, TrackYouTubeMapping>>(new Map())
const loading = ref(true)
const error = ref<string | null>(null)
const query = ref('')
const mode = ref<LibrarySearchMode>('album')
const unresolvedOnly = ref(loadUnresolvedOnlyFilter())

watch(unresolvedOnly, (value) => {
  saveUnresolvedOnlyFilter(value)
})

const filteredAlbums = computed(() => {
  let list = albums.value.filter((album) =>
    matchesLibrarySearch(query.value, album.title, album.artist, album.albumYear),
  )

  if (unresolvedOnly.value) {
    list = list.filter((album) => albumResolveStatus(album, mappings.value) !== 'resolved')
  } else {
    list = list.filter((album) => albumResolveStatus(album, mappings.value) === 'resolved')
  }

  return list
})

const filteredArtists = computed(() =>
  artists.value.filter((artist) =>
    matchesLibrarySearch(query.value, artist.name, artist.sortName, artist.scrobbleName),
  ),
)

const hasLibrary = computed(() => albums.value.length > 0 || artists.value.length > 0)
const showEmpty = computed(
  () => !loading.value && !error.value && !hasLibrary.value,
)
const hasPlayableAlbums = computed(() =>
  albums.value.some((album) => albumResolveStatus(album, mappings.value) === 'resolved'),
)

const showNoResults = computed(() => {
  if (loading.value || error.value) return false
  if (mode.value === 'album') {
    if (filteredAlbums.value.length) return false
    if (query.value.trim() || unresolvedOnly.value) return true
    return albums.value.length > 0 && !hasPlayableAlbums.value
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
  if (query.value.trim()) {
    return `No playable albums match "${query.value.trim()}".`
  }
  return 'No playable albums yet. Turn on Unresolved only to see albums still being resolved.'
})

function resolveStatus(album: Album) {
  return albumResolveStatus(album, mappings.value)
}

function isPlayingAlbum(albumId: string): boolean {
  if (!playback.showPlayerBar) return false
  return playback.currentItem?.albumId === albumId
}

onMounted(async () => {
  if (!auth.user) return

  try {
    const [loadedAlbums, loadedArtists] = await Promise.all([
      listAlbums(auth.user.uid),
      listArtists(auth.user.uid),
    ])
    albums.value = loadedAlbums
    artists.value = loadedArtists

    const trackIds = loadedAlbums.flatMap((album) => album.tracks.map((track) => track.id))
    mappings.value = await getMappingsForTrackIds(auth.user.uid, trackIds)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load library'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <p v-if="showEmpty" class="text-sm text-text-muted">
      No albums yet. Browse the
      <RouterLink to="/explorer" class="text-accent hover:underline">Explorer</RouterLink>
      and import a release, or
      <RouterLink to="/import" class="text-accent hover:underline">import from a Spotify export</RouterLink>.
    </p>

    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" />

    <template v-else-if="hasLibrary">
      <div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
            :to="{ name: 'artist-detail', params: { id: artist.id } }"
            class="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/5"
          >
            <ArtistAvatar :artist="artist" size="sm" rounded="full" />
            <span class="font-medium">{{ artist.name }}</span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </div>
</template>
