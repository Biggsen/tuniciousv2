<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ExplorerBreadcrumb from '@/components/explorer/ExplorerBreadcrumb.vue'
import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { useMusicBrainzUserAgent } from '@/composables/useMusicBrainzUserAgent'
import { getArtist } from '@/lib/musicbrainz/api'
import { MusicBrainzError } from '@/lib/musicbrainz/client'
import { yearFromDate } from '@/lib/musicbrainz/format'
import type { MbArtistDetail } from '@/lib/musicbrainz/types'

const route = useRoute()
const router = useRouter()
const { userAgent } = useMusicBrainzUserAgent()

const artist = ref<MbArtistDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const mbid = () => String(route.params.mbid)

async function load() {
  loading.value = true
  error.value = null

  try {
    artist.value = await getArtist(mbid(), userAgent.value)
  } catch (err) {
    error.value =
      err instanceof MusicBrainzError
        ? `MusicBrainz error (${err.status})`
        : err instanceof Error
          ? err.message
          : 'Failed to load artist'
  } finally {
    loading.value = false
  }
}

function openReleaseGroup(rgId: string) {
  router.push({ name: 'explorer-release-group', params: { mbid: rgId } })
}

onMounted(load)
watch(() => route.params.mbid, load)
</script>

<template>
  <div>
    <ExplorerBreadcrumb
      :items="[
        { label: 'Explorer', to: { name: 'explorer' } },
        { label: artist?.name ?? 'Artist' },
      ]"
    />

    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" />
    <template v-else-if="artist">
      <header class="mb-6">
        <h2 class="text-2xl font-semibold">{{ artist.name }}</h2>
        <p v-if="artist.disambiguation" class="mt-1 text-sm text-text-muted">
          {{ artist.disambiguation }}
        </p>
        <p v-if="artist.type || artist.country" class="mt-1 text-xs text-text-muted">
          <span v-if="artist.type">{{ artist.type }}</span>
          <span v-if="artist.type && artist.country"> · </span>
          <span v-if="artist.country">{{ artist.country }}</span>
        </p>
      </header>

      <h3 class="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">
        Release groups
      </h3>

      <p
        v-if="!artist['release-groups']?.length"
        class="text-sm text-text-muted"
      >
        No release groups listed.
      </p>

      <ul v-else class="divide-y divide-border rounded-xl border border-border">
        <li v-for="rg in artist['release-groups']" :key="rg.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-white/5"
            @click="openReleaseGroup(rg.id)"
          >
            <span>
              <span class="font-medium">{{ rg.title }}</span>
              <span class="mt-0.5 block text-xs text-text-muted">
                <template v-if="rg['primary-type']">{{ rg['primary-type'] }}</template>
                <template v-if="yearFromDate(rg['first-release-date'])">
                  · {{ yearFromDate(rg['first-release-date']) }}
                </template>
              </span>
            </span>
            <span class="text-xs text-text-muted">→</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
