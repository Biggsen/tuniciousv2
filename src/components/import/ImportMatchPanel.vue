<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import TrackCompareTable from '@/components/import/TrackCompareTable.vue'
import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { useMusicBrainzUserAgent } from '@/composables/useMusicBrainzUserAgent'
import { compareTracklists, tracklistMatchPercent } from '@/lib/import/compareTracks'
import { isStagedAlbumResolved } from '@/lib/import/matchLibrary'
import { getPrimaryIsrc } from '@/lib/import/parseSpotifyCsv'
import { pickBestRelease } from '@/lib/import/suggestRelease'
import type { StagedAlbum } from '@/lib/import/types'
import {
  AlbumAlreadyImportedError,
  findAlbumByReleaseMbid,
  importReleaseToLibrary,
} from '@/lib/album/firestore'
import {
  getRecording,
  getRelease,
  getReleaseGroup,
  lookupIsrc,
  searchReleaseGroups,
} from '@/lib/musicbrainz/api'
import { MusicBrainzError } from '@/lib/musicbrainz/client'
import {
  formatArtistCredit,
  formatCountry,
  formatReleaseEditionLabel,
  yearFromDate,
} from '@/lib/musicbrainz/format'
import { useAuthStore } from '@/stores/auth'
import type { Album } from '@/types/library'
import type { MbReleaseDetail, MbReleaseGroupSearchResult, MbReleaseRef } from '@/lib/musicbrainz/types'

const props = defineProps<{
  album: StagedAlbum | null
}>()

const emit = defineEmits<{
  imported: [payload: { albumUri: string; libraryAlbumId: string }]
  skip: [albumUri: string]
}>()

const auth = useAuthStore()
const { userAgent } = useMusicBrainzUserAgent()

const loading = ref(false)
const error = ref<string | null>(null)
const suggestionSource = ref<'isrc' | 'manual' | null>(null)
const selectedRelease = ref<MbReleaseDetail | null>(null)
const libraryAlbum = ref<Album | null>(null)
const importing = ref(false)
const importError = ref<string | null>(null)

const manualQuery = ref('')
const searching = ref(false)
const searchError = ref<string | null>(null)
const searchResults = ref<MbReleaseGroupSearchResult[]>([])
const browsingReleases = ref<MbReleaseRef[] | null>(null)
const browsingGroupTitle = ref<string | null>(null)
const loadingEdition = ref(false)

const releaseCache = new Map<string, MbReleaseDetail>()

const flatMbTracks = computed(() => {
  if (!selectedRelease.value?.media) return []
  return selectedRelease.value.media.flatMap((medium) => medium.tracks ?? [])
})

const compareRows = computed(() => {
  if (!props.album || !selectedRelease.value) return []
  return compareTracklists(props.album.tracks, flatMbTracks.value)
})

const matchPercent = computed(() => tracklistMatchPercent(compareRows.value))

const primaryIsrc = computed(() => (props.album ? getPrimaryIsrc(props.album) : undefined))

function buildDefaultSearchQuery(album: StagedAlbum): string {
  const artist = album.albumArtist.replace(/"/g, '\\"')
  const release = album.albumName.replace(/"/g, '\\"')
  return `artist:"${artist}" AND release:"${release}"`
}

async function loadRelease(releaseId: string, source: 'isrc' | 'manual') {
  loadingEdition.value = true
  error.value = null

  try {
    let release = releaseCache.get(releaseId)
    if (!release) {
      release = await getRelease(releaseId, userAgent.value)
      releaseCache.set(releaseId, release)
    }

    selectedRelease.value = release
    suggestionSource.value = source

    if (auth.user) {
      libraryAlbum.value = await findAlbumByReleaseMbid(auth.user.uid, releaseId)
    } else {
      libraryAlbum.value = null
    }
  } catch (err) {
    error.value =
      err instanceof MusicBrainzError
        ? `MusicBrainz error (${err.status})`
        : err instanceof Error
          ? err.message
          : 'Failed to load release'
  } finally {
    loadingEdition.value = false
  }
}

async function loadSuggestion(album: StagedAlbum) {
  loading.value = true
  error.value = null
  selectedRelease.value = null
  suggestionSource.value = null
  libraryAlbum.value = null
  searchResults.value = []
  browsingReleases.value = null
  browsingGroupTitle.value = null
  manualQuery.value = buildDefaultSearchQuery(album)

  if (isStagedAlbumResolved(album) && album.libraryAlbumId) {
    loading.value = false
    return
  }

  const isrc = getPrimaryIsrc(album)
  if (!isrc) {
    loading.value = false
    return
  }

  try {
    const result = await lookupIsrc(isrc, userAgent.value)
    const recordings = result.recordings ?? []

    for (const recording of recordings.slice(0, 3)) {
      const detail = await getRecording(recording.id, userAgent.value)
      const best = pickBestRelease(detail.releases ?? [], album)
      if (best) {
        await loadRelease(best.id, 'isrc')
        return
      }
    }
  } catch (err) {
    if (err instanceof MusicBrainzError && err.status === 404) {
      return
    }
    error.value =
      err instanceof MusicBrainzError
        ? `MusicBrainz error (${err.status})`
        : err instanceof Error
          ? err.message
          : 'ISRC lookup failed'
  } finally {
    loading.value = false
  }
}

async function runSearch() {
  const term = manualQuery.value.trim()
  if (!term) return

  searching.value = true
  searchError.value = null
  browsingReleases.value = null
  browsingGroupTitle.value = null

  try {
    searchResults.value = await searchReleaseGroups(term, userAgent.value)
  } catch (err) {
    searchError.value =
      err instanceof MusicBrainzError
        ? `MusicBrainz error (${err.status})`
        : err instanceof Error
          ? err.message
          : 'Search failed'
  } finally {
    searching.value = false
  }
}

async function openReleaseGroup(result: MbReleaseGroupSearchResult) {
  loadingEdition.value = true
  searchError.value = null

  try {
    const group = await getReleaseGroup(result.id, userAgent.value)
    browsingGroupTitle.value = group.title
    browsingReleases.value = group.releases ?? []
  } catch (err) {
    searchError.value =
      err instanceof MusicBrainzError
        ? `MusicBrainz error (${err.status})`
        : err instanceof Error
          ? err.message
          : 'Failed to load editions'
  } finally {
    loadingEdition.value = false
  }
}

async function importSelected() {
  if (!auth.user || !selectedRelease.value || !props.album) return

  importing.value = true
  importError.value = null

  try {
    const album = await importReleaseToLibrary(auth.user.uid, selectedRelease.value.id, userAgent.value)
    libraryAlbum.value = album
    emit('imported', { albumUri: props.album.albumUri, libraryAlbumId: album.id })
  } catch (err) {
    if (err instanceof AlbumAlreadyImportedError) {
      const existing = await findAlbumByReleaseMbid(auth.user.uid, selectedRelease.value.id)
      if (existing) {
        libraryAlbum.value = existing
        emit('imported', { albumUri: props.album.albumUri, libraryAlbumId: existing.id })
      }
      importError.value = 'Already in your library.'
    } else {
      importError.value = err instanceof Error ? err.message : 'Import failed'
    }
  } finally {
    importing.value = false
  }
}

watch(
  () => props.album,
  (album) => {
    if (!album) {
      selectedRelease.value = null
      error.value = null
      return
    }
    void loadSuggestion(album)
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col rounded-xl border border-border bg-surface-raised/40">
    <div v-if="!album" class="flex flex-1 items-center justify-center p-8 text-sm text-text-muted">
      Select an album to match against MusicBrainz.
    </div>

    <template v-else>
      <div class="border-b border-border px-4 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold">{{ album.albumName }}</h2>
            <p class="mt-1 text-sm text-text-muted">{{ album.albumArtist }}</p>
            <p class="mt-1 text-xs text-text-muted">
              {{ album.tracks.length }} tracks from CSV
              <template v-if="album.releaseDate"> · {{ album.releaseDate }}</template>
              <template v-if="primaryIsrc"> · ISRC {{ primaryIsrc }}</template>
            </p>
          </div>
          <button
            v-if="album.status === 'pending'"
            type="button"
            class="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text"
            @click="emit('skip', album.albumUri)"
          >
            Skip
          </button>
        </div>

        <details class="mt-4">
          <summary class="cursor-pointer text-xs font-medium uppercase tracking-wider text-text-muted">
            CSV tracklist
          </summary>
          <ol class="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border text-sm divide-y divide-border">
            <li
              v-for="track in album.tracks"
              :key="track.trackUri"
              class="flex gap-3 px-3 py-1.5"
            >
              <span class="w-8 shrink-0 text-text-muted tabular-nums">{{ track.trackNumber }}</span>
              <span class="min-w-0 flex-1 truncate">{{ track.trackName }}</span>
            </li>
          </ol>
        </details>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <ExplorerLoading v-if="loading" />
        <ExplorerError v-else-if="error" :message="error" />

        <template v-else>
          <div
            v-if="album.status === 'in-library'"
            class="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100"
          >
            Already in your library — matched by title and artist.
            <RouterLink
              v-if="album.libraryAlbumId"
              :to="{ name: 'album-detail', params: { id: album.libraryAlbumId } }"
              class="ml-1 text-accent hover:underline"
            >
              View album
            </RouterLink>
          </div>

          <div
            v-else-if="album.status === 'imported'"
            class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          >
            Imported this session.
            <RouterLink
              v-if="album.libraryAlbumId"
              :to="{ name: 'album-detail', params: { id: album.libraryAlbumId } }"
              class="ml-1 text-accent hover:underline"
            >
              View in library
            </RouterLink>
          </div>

          <template v-else>
          <div v-if="selectedRelease" class="mb-6">
            <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-accent">
                  {{ suggestionSource === 'isrc' ? 'Suggested from ISRC' : 'Selected release' }}
                </p>
                <h3 class="mt-1 font-medium">{{ selectedRelease.title }}</h3>
                <p class="mt-1 text-sm text-text-muted">
                  {{ formatArtistCredit(selectedRelease['artist-credit']) }}
                </p>
                <p class="mt-1 text-xs text-text-muted">
                  {{ formatReleaseEditionLabel(selectedRelease, selectedRelease['release-group']?.title) }}
                  <template v-if="selectedRelease.country">
                    · {{ formatCountry(selectedRelease.country) }}
                  </template>
                  <template v-if="yearFromDate(selectedRelease['release-group']?.['first-release-date'])">
                    · RG {{ yearFromDate(selectedRelease['release-group']?.['first-release-date']) }}
                  </template>
                </p>
              </div>

              <div class="flex flex-wrap gap-2">
                <button
                  v-if="!libraryAlbum"
                  type="button"
                  class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
                  :disabled="importing"
                  @click="importSelected"
                >
                  {{ importing ? 'Importing…' : 'Import to library' }}
                </button>
                <RouterLink
                  v-else
                  :to="{ name: 'album-detail', params: { id: libraryAlbum.id } }"
                  class="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
                >
                  In library — view album
                </RouterLink>
              </div>
            </div>

            <p v-if="importError" class="mb-3 text-sm text-red-300">{{ importError }}</p>

            <TrackCompareTable :rows="compareRows" :match-percent="matchPercent" />
          </div>

          <div v-else-if="!primaryIsrc" class="mb-4 text-sm text-text-muted">
            No ISRC on track 1 — search MusicBrainz manually below.
          </div>

          <div class="border-t border-border pt-4">
            <h3 class="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">
              Search MusicBrainz
            </h3>

            <form class="mb-4 flex gap-2" @submit.prevent="runSearch">
              <input
                v-model="manualQuery"
                type="search"
                class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50"
                placeholder='artist:"Name" AND release:"Album"'
              />
              <button
                type="submit"
                class="shrink-0 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
                :disabled="searching"
              >
                {{ searching ? 'Searching…' : 'Search' }}
              </button>
            </form>

            <ExplorerError v-if="searchError" :message="searchError" />
            <ExplorerLoading v-else-if="loadingEdition && !selectedRelease" />

            <div v-if="browsingReleases" class="mb-4">
              <p class="mb-2 text-xs text-text-muted">Editions for {{ browsingGroupTitle }}</p>
              <ul class="divide-y divide-border rounded-xl border border-border">
                <li v-for="release in browsingReleases" :key="release.id">
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
                    @click="loadRelease(release.id, 'manual')"
                  >
                    <span>
                      <span class="font-medium">{{ release.title }}</span>
                      <span class="mt-0.5 block text-xs text-text-muted">
                        <template v-if="release.date">{{ release.date }}</template>
                        <template v-if="release.country"> · {{ formatCountry(release.country) }}</template>
                        <template v-if="release.status"> · {{ release.status }}</template>
                      </span>
                    </span>
                    <span class="text-xs text-text-muted">Compare →</span>
                  </button>
                </li>
              </ul>
            </div>

            <ul v-else-if="searchResults.length" class="divide-y divide-border rounded-xl border border-border">
              <li v-for="result in searchResults" :key="result.id">
                <button
                  type="button"
                  class="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                  @click="openReleaseGroup(result)"
                >
                  <span class="text-sm font-medium">{{ result.title }}</span>
                  <span class="text-xs text-text-muted">
                    {{ formatArtistCredit(result['artist-credit']) }}
                    <template v-if="yearFromDate(result['first-release-date'])">
                      · {{ yearFromDate(result['first-release-date']) }}
                    </template>
                  </span>
                </button>
              </li>
            </ul>
          </div>
          </template>
        </template>
      </div>
    </template>
  </div>
</template>
