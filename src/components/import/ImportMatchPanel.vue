<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import TrackCompareTable from '@/components/import/TrackCompareTable.vue'
import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { useMusicBrainzUserAgent } from '@/composables/useMusicBrainzUserAgent'
import { compareTracklists, tracklistMatchPercent } from '@/lib/import/compareTracks'
import { findLibraryMatch, isStagedAlbumResolved } from '@/lib/import/matchLibrary'
import { getPrimaryIsrc } from '@/lib/import/parseSpotifyCsv'
import { pickBestRelease } from '@/lib/import/suggestRelease'
import {
  editionsToTry,
  isReleaseAlignedWithAlbum,
} from '@/lib/import/tryEditionsInOrder'
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
import { useImportStore } from '@/stores/import'
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
const importStore = useImportStore()
const { userAgent } = useMusicBrainzUserAgent()

const loading = ref(false)
const error = ref<string | null>(null)
const suggestionSource = ref<'isrc' | 'search' | 'manual' | null>(null)
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
const autoImportPending = ref(false)

const AUTO_IMPORT_DELAY_MS = 500
const AUTO_ADVANCE_DELAY_MS = 400
let autoImportToken = 0
let loadSuggestionToken = 0

const autoAdvancePending = ref(false)
/** Run automation for the current album only (no queue advance). */
const singleAlbumAutomation = ref(false)

const automationActive = computed(
  () => importStore.automationEnabled || singleAlbumAutomation.value,
)

function isActiveSuggestion(token: number, album: StagedAlbum): boolean {
  return token === loadSuggestionToken && props.album?.id === album.id
}

function cancelAutoImport() {
  autoImportToken++
  autoImportPending.value = false
}

function clearSingleAlbumAutomation() {
  singleAlbumAutomation.value = false
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

const releaseCache = new Map<string, MbReleaseDetail>()

const flatMbTracks = computed(() => {
  if (!selectedRelease.value?.media) return []
  return selectedRelease.value.media.flatMap((medium) => medium.tracks ?? [])
})

const isV1Source = computed(() => props.album?.source === 'v1')

const compareRows = computed(() => {
  if (!props.album || !selectedRelease.value || isV1Source.value) return []
  return compareTracklists(props.album.tracks, flatMbTracks.value)
})

const matchPercent = computed(() => tracklistMatchPercent(compareRows.value))

const primaryIsrc = computed(() => (props.album ? getPrimaryIsrc(props.album) : undefined))

type SuggestionSource = 'isrc' | 'search' | 'manual'

function isAutomatedSource(source: SuggestionSource): boolean {
  return source === 'isrc' || source === 'search'
}

const suggestionSourceLabel = computed(() => {
  switch (suggestionSource.value) {
    case 'isrc':
      return 'Suggested from ISRC'
    case 'search':
      return 'Suggested from title search'
    default:
      return 'Selected release'
  }
})

const autoImportedLabel = computed(() => {
  if (isV1Source.value) {
    if (suggestionSource.value === 'search') return 'auto-imported from title search match'
    return null
  }
  if (matchPercent.value !== 100) return null
  if (suggestionSource.value === 'isrc') return 'auto-imported from ISRC match'
  if (suggestionSource.value === 'search') return 'auto-imported from title search match'
  return null
})

function buildDefaultSearchQuery(album: StagedAlbum): string {
  const artist = album.albumArtist.replace(/"/g, '\\"')
  const release = album.albumName.replace(/"/g, '\\"')
  return `artist:"${artist}" AND release:"${release}"`
}

async function maybeAutoImportIfAligned(
  release: MbReleaseDetail,
  album: StagedAlbum,
  token: number,
): Promise<boolean> {
  if (!automationActive.value) return false
  if (!isActiveSuggestion(token, album) || album.status !== 'pending') return false
  if (!suggestionSource.value || !isAutomatedSource(suggestionSource.value)) return false
  if (libraryAlbum.value || importing.value) return false
  if (!isReleaseAlignedWithAlbum(album, release)) return false

  const autoToken = ++autoImportToken
  autoImportPending.value = true

  await delay(AUTO_IMPORT_DELAY_MS)

  if (autoToken !== autoImportToken || !isActiveSuggestion(token, album)) {
    autoImportPending.value = false
    return false
  }
  if (props.album?.status !== 'pending') {
    autoImportPending.value = false
    return false
  }
  if (libraryAlbum.value || importing.value) {
    autoImportPending.value = false
    return false
  }

  try {
    await importSelected(album)
    return !importError.value
  } finally {
    if (autoToken === autoImportToken) {
      autoImportPending.value = false
    }
    clearSingleAlbumAutomation()
  }
}

async function maybeAutoAdvance(album: StagedAlbum, token: number) {
  if (!importStore.automationEnabled) return
  if (!isActiveSuggestion(token, album) || props.album?.status !== 'pending') return

  autoAdvancePending.value = true
  await delay(AUTO_ADVANCE_DELAY_MS)

  if (!isActiveSuggestion(token, album) || props.album?.status !== 'pending') {
    autoAdvancePending.value = false
    return
  }

  autoAdvancePending.value = false
  importStore.advanceToNextPending(album.albumUri)
}

type ReleaseLoadResult = 'imported' | 'in-library' | 'needs-manual' | 'inactive'

async function loadRelease(
  releaseId: string,
  source: SuggestionSource,
  album: StagedAlbum,
  token: number,
): Promise<ReleaseLoadResult> {
  if (!isActiveSuggestion(token, album)) return 'inactive'

  loadingEdition.value = true
  error.value = null

  try {
    let release = releaseCache.get(releaseId)
    if (!release) {
      release = await getRelease(releaseId, userAgent.value)
      releaseCache.set(releaseId, release)
    }

    if (!isActiveSuggestion(token, album)) return 'inactive'

    selectedRelease.value = release
    suggestionSource.value = source

    if (auth.user) {
      libraryAlbum.value = await findAlbumByReleaseMbid(auth.user.uid, releaseId)
    } else {
      libraryAlbum.value = null
    }

    if (!isActiveSuggestion(token, album)) return 'inactive'

    if (libraryAlbum.value && album.status === 'pending' && isAutomatedSource(source)) {
      const advance = importStore.automationEnabled
      importStore.markInLibrary(album.albumUri, libraryAlbum.value.id, advance)
      clearSingleAlbumAutomation()
      return 'in-library'
    }

    if (!libraryAlbum.value && album.status === 'pending') {
      const titleMatch = findLibraryMatch(album, importStore.libraryAlbums)
      if (titleMatch) {
        libraryAlbum.value = titleMatch
        const advance = isAutomatedSource(source) && importStore.automationEnabled
        importStore.markInLibrary(album.albumUri, titleMatch.id, advance)
        clearSingleAlbumAutomation()
        return isAutomatedSource(source) ? 'in-library' : 'needs-manual'
      }
    }

    if (isAutomatedSource(source)) {
      const imported = await maybeAutoImportIfAligned(release, album, token)
      if (imported) return 'imported'
      return 'needs-manual'
    }

    return 'needs-manual'
  } catch (err) {
    if (!isActiveSuggestion(token, album)) return 'inactive'
    error.value =
      err instanceof MusicBrainzError
        ? `MusicBrainz error (${err.status})`
        : err instanceof Error
          ? err.message
          : 'Failed to load release'
    return isAutomatedSource(source) ? 'needs-manual' : 'inactive'
  } finally {
    loadingEdition.value = false
  }
}

async function tryAutomatedEditions(
  releases: MbReleaseRef[],
  album: StagedAlbum,
  source: 'isrc' | 'search',
  token: number,
): Promise<ReleaseLoadResult> {
  if (!isActiveSuggestion(token, album)) return 'inactive'

  const candidates = editionsToTry(releases, album)
  if (!candidates.length) return 'needs-manual'

  for (const candidate of candidates) {
    if (!isActiveSuggestion(token, album)) return 'inactive'

    let release = releaseCache.get(candidate.id)
    if (!release) {
      release = await getRelease(candidate.id, userAgent.value)
      releaseCache.set(candidate.id, release)
    }

    if (!isActiveSuggestion(token, album)) return 'inactive'
    if (!isReleaseAlignedWithAlbum(album, release)) continue

    return loadRelease(candidate.id, source, album, token)
  }

  return 'needs-manual'
}

async function trySearchFallback(album: StagedAlbum, token: number): Promise<ReleaseLoadResult> {
  if (!automationActive.value) return 'needs-manual'
  if (!isActiveSuggestion(token, album)) return 'inactive'

  try {
    const results = await searchReleaseGroups(buildDefaultSearchQuery(album), userAgent.value)
    if (!isActiveSuggestion(token, album)) return 'inactive'

    const firstGroup = results[0]
    if (!firstGroup) return 'needs-manual'

    const group = await getReleaseGroup(firstGroup.id, userAgent.value)
    if (!isActiveSuggestion(token, album)) return 'inactive'

    return tryAutomatedEditions(group.releases ?? [], album, 'search', token)
  } catch {
    return 'needs-manual'
  }
}

async function runSearchTierThenAdvance(album: StagedAlbum, token: number) {
  const searchResult = await trySearchFallback(album, token)
  if (!isActiveSuggestion(token, album) || props.album?.status !== 'pending') {
    clearSingleAlbumAutomation()
    return
  }
  if (searchResult === 'needs-manual') {
    clearSingleAlbumAutomation()
    await maybeAutoAdvance(album, token)
  }
}

async function loadSuggestion(album: StagedAlbum) {
  const token = ++loadSuggestionToken
  cancelAutoImport()
  autoAdvancePending.value = false
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
    if (isActiveSuggestion(token, album)) {
      loading.value = false
    }
    return
  }

  const isrc = getPrimaryIsrc(album)
  if (!isrc) {
    if (isActiveSuggestion(token, album)) {
      loading.value = false
      await runSearchTierThenAdvance(album, token)
    }
    return
  }

  let isrcResult: ReleaseLoadResult = 'needs-manual'
  let isrcNotFound = false

  try {
    const result = await lookupIsrc(isrc, userAgent.value)
    if (!isActiveSuggestion(token, album)) return

    const recordings = result.recordings ?? []

    for (const recording of recordings.slice(0, 3)) {
      if (!isActiveSuggestion(token, album)) return

      const detail = await getRecording(recording.id, userAgent.value)
      if (!isActiveSuggestion(token, album)) return

      const releases = detail.releases ?? []
      if (automationActive.value) {
        isrcResult = await tryAutomatedEditions(releases, album, 'isrc', token)
      } else {
        const best = pickBestRelease(releases, album)
        if (best) {
          isrcResult = await loadRelease(best.id, 'isrc', album, token)
        }
      }

      if (isrcResult !== 'needs-manual') break
    }
  } catch (err) {
    if (!isActiveSuggestion(token, album)) return
    if (err instanceof MusicBrainzError && err.status === 404) {
      isrcNotFound = true
    } else {
      error.value =
        err instanceof MusicBrainzError
          ? `MusicBrainz error (${err.status})`
          : err instanceof Error
            ? err.message
            : 'ISRC lookup failed'
    }
  } finally {
    if (isActiveSuggestion(token, album)) {
      loading.value = false
    }
  }

  if (!isActiveSuggestion(token, album) || props.album?.status !== 'pending') return

  if (isrcNotFound || isrcResult === 'needs-manual') {
    await runSearchTierThenAdvance(album, token)
  }
}

async function compareManualRelease(releaseId: string) {
  if (!props.album) return
  const token = ++loadSuggestionToken
  cancelAutoImport()
  await loadRelease(releaseId, 'manual', props.album, token)
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

async function importSelected(album: StagedAlbum) {
  if (!auth.user || !selectedRelease.value) return

  importing.value = true
  importError.value = null

  try {
    const imported = await importReleaseToLibrary(auth.user.uid, selectedRelease.value.id, userAgent.value)
    libraryAlbum.value = imported
    emit('imported', { albumUri: album.albumUri, libraryAlbumId: imported.id })
  } catch (err) {
    if (err instanceof AlbumAlreadyImportedError) {
      const existing = await findAlbumByReleaseMbid(auth.user.uid, selectedRelease.value.id)
      if (existing) {
        libraryAlbum.value = existing
        emit('imported', { albumUri: album.albumUri, libraryAlbumId: existing.id })
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
  () => importStore.automationEnabled,
  (enabled) => {
    if (!enabled) {
      cancelAutoImport()
      autoAdvancePending.value = false
      return
    }
    clearSingleAlbumAutomation()
    if (props.album?.status === 'pending') {
      void loadSuggestion(props.album)
    }
  },
)

watch(
  () => props.album?.id ?? null,
  (albumId) => {
    cancelAutoImport()
    clearSingleAlbumAutomation()
    if (!albumId || !props.album) {
      selectedRelease.value = null
      error.value = null
      return
    }
    void loadSuggestion(props.album)
  },
  { immediate: true },
)

async function runAutoThisAlbum() {
  if (!props.album || props.album.status !== 'pending') return
  if (importStore.automationEnabled || singleAlbumAutomation.value) return

  singleAlbumAutomation.value = true
  await loadSuggestion(props.album)
  if (props.album?.status === 'pending' && !autoImportPending.value) {
    clearSingleAlbumAutomation()
  }
}
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
              <template v-if="isV1Source">
                No Spotify tracklist — matching by title, artist, year
              </template>
              <template v-else>
                {{ album.tracks.length }} tracks from CSV
              </template>
              <template v-if="album.releaseDate"> · {{ album.releaseDate }}</template>
              <template v-if="primaryIsrc"> · ISRC {{ primaryIsrc }}</template>
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <button
              v-if="album.status === 'pending'"
              type="button"
              class="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
              :disabled="
                loading ||
                importing ||
                autoImportPending ||
                singleAlbumAutomation ||
                importStore.automationEnabled
              "
              @click="runAutoThisAlbum"
            >
              {{
                singleAlbumAutomation || autoImportPending ? 'Auto…' : 'Auto this'
              }}
            </button>
            <button
              v-if="album.status === 'pending'"
              type="button"
              class="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text"
              @click="emit('skip', album.albumUri)"
            >
              Skip
            </button>
          </div>
        </div>

        <details v-if="!isV1Source && album.tracks.length" class="mt-4">
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
        <ExplorerLoading v-if="loading" message="Loading from MusicBrainz…" />
        <ExplorerError v-else-if="error" :message="error" />

        <p
          v-if="autoAdvancePending"
          class="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100"
        >
          No {{ isV1Source ? 'usable title match' : '100% match' }} — moving to next album…
        </p>

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
            Imported this session
            <template v-if="autoImportedLabel">
              — {{ autoImportedLabel }}
            </template>.
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
                  {{ suggestionSourceLabel }}
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
                  :disabled="importing || autoImportPending"
                  @click="props.album && importSelected(props.album)"
                >
                  {{ importing || autoImportPending ? 'Importing…' : 'Import to library' }}
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

            <p
              v-if="autoImportPending"
              class="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200"
            >
              <template v-if="isV1Source">Title match ready — importing…</template>
              <template v-else>100% aligned by position — importing…</template>
            </p>

            <p v-if="importError" class="mb-3 text-sm text-red-300">{{ importError }}</p>

            <TrackCompareTable
              v-if="!isV1Source"
              :rows="compareRows"
              :match-percent="matchPercent"
            />
          </div>

          <div v-else-if="!primaryIsrc && !isV1Source" class="mb-4 text-sm text-text-muted">
            No ISRC on track 1 — search MusicBrainz manually below.
          </div>

          <div v-else-if="isV1Source && !selectedRelease" class="mb-4 text-sm text-text-muted">
            Search MusicBrainz by title and artist below.
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
            <ExplorerLoading
              v-else-if="loadingEdition && !selectedRelease"
              message="Loading from MusicBrainz…"
            />

            <div v-if="browsingReleases" class="mb-4">
              <p class="mb-2 text-xs text-text-muted">Editions for {{ browsingGroupTitle }}</p>
              <ul class="divide-y divide-border rounded-xl border border-border">
                <li v-for="release in browsingReleases" :key="release.id">
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
                    @click="compareManualRelease(release.id)"
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
