<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ExplorerBreadcrumb from '@/components/explorer/ExplorerBreadcrumb.vue'
import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import { useMusicBrainzUserAgent } from '@/composables/useMusicBrainzUserAgent'
import { getReleaseGroup } from '@/lib/musicbrainz/api'
import { MusicBrainzError } from '@/lib/musicbrainz/client'
import { formatArtistCredit, formatCountry, yearFromDate } from '@/lib/musicbrainz/format'
import type { MbReleaseGroupDetail } from '@/lib/musicbrainz/types'

const route = useRoute()
const router = useRouter()
const { userAgent } = useMusicBrainzUserAgent()

const releaseGroup = ref<MbReleaseGroupDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const mbid = () => String(route.params.mbid)

const primaryArtist = computed(() => releaseGroup.value?.['artist-credit']?.[0]?.artist)

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

  items.push({ label: releaseGroup.value?.title ?? 'Release group' })
  return items
})

async function load() {
  loading.value = true
  error.value = null

  try {
    releaseGroup.value = await getReleaseGroup(mbid(), userAgent.value)
  } catch (err) {
    error.value =
      err instanceof MusicBrainzError
        ? `MusicBrainz error (${err.status})`
        : err instanceof Error
          ? err.message
          : 'Failed to load release group'
  } finally {
    loading.value = false
  }
}

function openRelease(releaseId: string) {
  router.push({ name: 'explorer-release', params: { mbid: releaseId } })
}

onMounted(load)
watch(() => route.params.mbid, load)
</script>

<template>
  <div>
    <ExplorerBreadcrumb :items="breadcrumbItems" />

    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error" :message="error" />
    <template v-else-if="releaseGroup">
      <header class="mb-6">
        <h2 class="text-2xl font-semibold">{{ releaseGroup.title }}</h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ formatArtistCredit(releaseGroup['artist-credit']) }}
        </p>
        <p class="mt-1 text-xs text-text-muted">
          <template v-if="releaseGroup['primary-type']">{{ releaseGroup['primary-type'] }}</template>
          <template v-if="yearFromDate(releaseGroup['first-release-date'])">
            · First release {{ yearFromDate(releaseGroup['first-release-date']) }}
          </template>
          <template v-if="releaseGroup.disambiguation">
            · {{ releaseGroup.disambiguation }}
          </template>
        </p>
      </header>

      <h3 class="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">
        Releases (editions)
      </h3>

      <p v-if="!releaseGroup.releases?.length" class="text-sm text-text-muted">
        No releases listed.
      </p>

      <ul v-else class="divide-y divide-border rounded-xl border border-border">
        <li v-for="release in releaseGroup.releases" :key="release.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-white/5"
            @click="openRelease(release.id)"
          >
            <span>
              <span class="font-medium">{{ release.title }}</span>
              <span class="mt-0.5 block text-xs text-text-muted">
                <template v-if="release.date">{{ release.date }}</template>
                <template v-if="release.country"> · {{ formatCountry(release.country) }}</template>
                <template v-if="release.status"> · {{ release.status }}</template>
              </span>
            </span>
            <span class="text-xs text-text-muted">Tracklist →</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
