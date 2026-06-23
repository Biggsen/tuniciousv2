<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import ExplorerBreadcrumb from '@/components/explorer/ExplorerBreadcrumb.vue'
import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { useMusicBrainzUserAgent } from '@/composables/useMusicBrainzUserAgent'
import { AlbumAlreadyImportedError, findAlbumByReleaseMbid, importReleaseToLibrary } from '@/lib/album/firestore'
import { getRelease } from '@/lib/musicbrainz/api'
import { MusicBrainzError } from '@/lib/musicbrainz/client'
import {
  formatArtistCredit,
  formatCountry,
  formatDuration,
  formatReleaseEditionLabel,
  yearFromDate,
} from '@/lib/musicbrainz/format'
import { useAuthStore } from '@/stores/auth'
import type { Album } from '@/types/library'
import type { MbReleaseDetail, MbTrack } from '@/lib/musicbrainz/types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { userAgent } = useMusicBrainzUserAgent()

const release = ref<MbReleaseDetail | null>(null)
const libraryAlbum = ref<Album | null>(null)
const loading = ref(true)
const importing = ref(false)
const error = ref<string | null>(null)
const importError = ref<string | null>(null)

const mbid = () => String(route.params.mbid)

const flatTracks = computed(() => {
  if (!release.value?.media) return [] as MbTrack[]
  return release.value.media.flatMap((medium) => medium.tracks ?? [])
})

const rgYear = computed(() =>
  yearFromDate(release.value?.['release-group']?.['first-release-date']),
)

const primaryArtist = computed(() => release.value?.['artist-credit']?.[0]?.artist)

const releaseGroup = computed(() => release.value?.['release-group'])

const breadcrumbItems = computed(() => {
  const items: { label: string; to?: { name: string; params?: Record<string, string> } }[] = [
    { label: 'Explorer', to: { name: 'explorer' } },
  ]

  if (primaryArtist.value) {
    items.push({
      label: primaryArtist.value.name,
      to: { name: 'explorer-artist', params: { mbid: primaryArtist.value.id } },
    })
  }

  if (releaseGroup.value) {
    items.push({
      label: releaseGroup.value.title,
      to: { name: 'explorer-release-group', params: { mbid: releaseGroup.value.id } },
    })
  }

  if (release.value) {
    items.push({
      label: formatReleaseEditionLabel(release.value, releaseGroup.value?.title),
    })
  } else {
    items.push({ label: 'Release' })
  }

  return items
})

async function load() {
  loading.value = true
  error.value = null
  importError.value = null

  try {
    release.value = await getRelease(mbid(), userAgent.value)

    if (auth.user) {
      libraryAlbum.value = await findAlbumByReleaseMbid(auth.user.uid, mbid())
    }
  } catch (err) {
    error.value =
      err instanceof MusicBrainzError
        ? `MusicBrainz error (${err.status})`
        : err instanceof Error
          ? err.message
          : 'Failed to load release'
  } finally {
    loading.value = false
  }
}

async function importToLibrary() {
  if (!auth.user) return

  importing.value = true
  importError.value = null

  try {
    const album = await importReleaseToLibrary(auth.user.uid, mbid(), userAgent.value)
    libraryAlbum.value = album
    router.push({ name: 'album-detail', params: { id: album.id } })
  } catch (err) {
    if (err instanceof AlbumAlreadyImportedError) {
      libraryAlbum.value = await findAlbumByReleaseMbid(auth.user.uid, mbid())
      importError.value = 'Already in your library.'
    } else {
      importError.value = err instanceof Error ? err.message : 'Import failed'
    }
  } finally {
    importing.value = false
  }
}

function trackLength(track: MbTrack): number | undefined {
  return track.length ?? track.recording?.length
}

onMounted(load)
watch(() => route.params.mbid, load)
</script>

<template>
  <div>
    <ExplorerBreadcrumb :items="breadcrumbItems" />

    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" />
    <template v-else-if="release">
      <header class="mb-6">
        <h2 class="text-2xl font-semibold">{{ release.title }}</h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ formatArtistCredit(release['artist-credit']) }}
        </p>
        <p class="mt-1 text-xs text-text-muted">
          <template v-if="release.date">Edition {{ release.date }}</template>
          <template v-if="rgYear"> · RG year {{ rgYear }}</template>
          <template v-if="release.country"> · {{ formatCountry(release.country) }}</template>
          <template v-if="release.status"> · {{ release.status }}</template>
        </p>
      </header>

      <div class="mb-6 flex flex-wrap items-center gap-3">
        <button
          v-if="!libraryAlbum"
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
          :disabled="importing"
          @click="importToLibrary"
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
        <p v-if="importError" class="text-sm text-red-300">{{ importError }}</p>
      </div>

      <h3 class="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">
        Tracklist
      </h3>

      <p v-if="!flatTracks.length" class="text-sm text-text-muted">No tracks on this release.</p>

      <ol v-else class="divide-y divide-border rounded-xl border border-border">
        <li
          v-for="(track, index) in flatTracks"
          :key="track.id || `${track.number}-${index}`"
          class="flex items-center gap-4 px-4 py-2.5 text-sm"
        >
          <span class="w-8 shrink-0 text-right text-text-muted tabular-nums">{{ track.number }}</span>
          <span class="min-w-0 flex-1 truncate">{{ track.title }}</span>
          <span class="shrink-0 text-xs text-text-muted tabular-nums">
            {{ formatDuration(trackLength(track)) }}
          </span>
        </li>
      </ol>
    </template>
  </div>
</template>
