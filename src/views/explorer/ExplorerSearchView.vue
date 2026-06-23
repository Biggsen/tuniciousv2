<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import { useMusicBrainzUserAgent } from '@/composables/useMusicBrainzUserAgent'
import { MusicBrainzError } from '@/lib/musicbrainz/client'
import { searchArtists, searchReleaseGroups } from '@/lib/musicbrainz/api'
import { formatArtistCredit, yearFromDate } from '@/lib/musicbrainz/format'

type SearchMode = 'artist' | 'album'

const router = useRouter()
const { userAgent } = useMusicBrainzUserAgent()

const mode = ref<SearchMode>('album')
const query = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const artistResults = ref<Awaited<ReturnType<typeof searchArtists>>>([])
const albumResults = ref<Awaited<ReturnType<typeof searchReleaseGroups>>>([])
const hasSearched = ref(false)

async function runSearch() {
  const term = query.value.trim()
  if (!term) return

  loading.value = true
  error.value = null
  hasSearched.value = true

  try {
    if (mode.value === 'artist') {
      artistResults.value = await searchArtists(term, userAgent.value)
      albumResults.value = []
    } else {
      albumResults.value = await searchReleaseGroups(term, userAgent.value)
      artistResults.value = []
    }
  } catch (err) {
    error.value =
      err instanceof MusicBrainzError
        ? `MusicBrainz error (${err.status})`
        : err instanceof Error
          ? err.message
          : 'Search failed'
  } finally {
    loading.value = false
  }
}

function openArtist(mbid: string) {
  router.push({ name: 'explorer-artist', params: { mbid } })
}

function openReleaseGroup(mbid: string) {
  router.push({ name: 'explorer-release-group', params: { mbid } })
}
</script>

<template>
  <div>
    <p class="mb-6 max-w-2xl text-sm text-text-muted">
      Search MusicBrainz to browse artists, release groups, editions, and tracklists.
      Import to your library comes in Phase 2.
    </p>

    <div class="mb-4 flex gap-2">
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
    </div>

    <form class="mb-6 flex max-w-xl gap-2" @submit.prevent="runSearch">
      <input
        v-model="query"
        type="search"
        :placeholder="mode === 'artist' ? 'Search artists…' : 'Search albums (release groups)…'"
        class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        class="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
        :disabled="loading || !query.trim()"
      >
        Search
      </button>
    </form>

    <ExplorerError v-if="error" :message="error" class="mb-4" />

    <p v-if="loading" class="text-sm text-text-muted">Searching… (rate-limited to 1 req/sec)</p>

    <div v-else-if="hasSearched && mode === 'artist' && !artistResults.length" class="text-sm text-text-muted">
      No artists found.
    </div>

    <div v-else-if="hasSearched && mode === 'album' && !albumResults.length" class="text-sm text-text-muted">
      No release groups found.
    </div>

    <ul v-else-if="mode === 'artist'" class="divide-y divide-border rounded-xl border border-border">
      <li v-for="artist in artistResults" :key="artist.id">
        <button
          type="button"
          class="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-white/5"
          @click="openArtist(artist.id)"
        >
          <span class="font-medium">{{ artist.name }}</span>
          <span v-if="artist.disambiguation" class="text-xs text-text-muted">
            {{ artist.disambiguation }}
          </span>
        </button>
      </li>
    </ul>

    <ul v-else-if="mode === 'album'" class="divide-y divide-border rounded-xl border border-border">
      <li v-for="rg in albumResults" :key="rg.id">
        <button
          type="button"
          class="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-white/5"
          @click="openReleaseGroup(rg.id)"
        >
          <span class="font-medium">{{ rg.title }}</span>
          <span class="text-xs text-text-muted">
            {{ formatArtistCredit(rg['artist-credit']) }}
            <template v-if="rg['primary-type']"> · {{ rg['primary-type'] }}</template>
            <template v-if="yearFromDate(rg['first-release-date'])">
              · {{ yearFromDate(rg['first-release-date']) }}
            </template>
            <template v-if="rg.disambiguation"> · {{ rg.disambiguation }}</template>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
