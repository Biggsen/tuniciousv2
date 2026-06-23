<script setup lang="ts">
import { computed, ref } from 'vue'

import { formatDuration } from '@/lib/musicbrainz/format'
import {
  setArtistPreferredYouTubeChannel,
} from '@/lib/artist/firestore'
import { getVideoById } from '@/lib/youtube/client'
import { buildAutoSearchQuery, buildChannelScopedSearchQuery } from '@/lib/youtube/query'
import { deleteTrackMapping } from '@/lib/youtube/firestore'
import {
  autoResolveTrack,
  resolveTrackFromCandidate,
  resolveTrackFromVideoInput,
  searchTrackCandidates,
} from '@/lib/youtube/resolve'
import type { Artist, Track } from '@/types/library'
import type { ArtistResolveContext, TrackYouTubeMapping, YouTubeVideoCandidate } from '@/types/youtube'

const props = defineProps<{
  uid: string
  artistId: string
  artistName: string
  resolveContext: ArtistResolveContext
  track: Track
  mapping: TrackYouTubeMapping | null
}>()

const emit = defineEmits<{
  updated: [mapping: TrackYouTubeMapping | null]
  channelPreferenceUpdated: [artist: Artist]
}>()

const expanded = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')
const manualInput = ref('')
const candidates = ref<YouTubeVideoCandidate[]>([])
const useChannelForArtist = ref(false)

const isMappingChannelPreferred = computed(() => {
  if (!props.mapping?.channelTitle || !props.resolveContext.preferredChannelTitle) return false
  return props.mapping.channelTitle === props.resolveContext.preferredChannelTitle
})

const canSetChannelFromMapping = computed(
  () => Boolean(props.mapping?.channelTitle) && !isMappingChannelPreferred.value,
)

async function saveChannelPreference(channel: { channelId: string; channelTitle: string }) {
  const artist = await setArtistPreferredYouTubeChannel(props.uid, props.artistId, channel)
  emit('channelPreferenceUpdated', artist)
}

async function handleAutoResolve() {
  busy.value = true
  error.value = null
  try {
    const mapping = await autoResolveTrack(props.uid, props.resolveContext, props.track)
    if (!mapping) {
      error.value = 'No match found'
      return
    }
    emit('updated', mapping)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Auto-resolve failed'
  } finally {
    busy.value = false
  }
}

async function handleSearch() {
  busy.value = true
  error.value = null
  try {
    candidates.value = await searchTrackCandidates(
      props.resolveContext,
      props.track,
      searchQuery.value || undefined,
    )
    if (!candidates.value.length) {
      error.value = 'No results'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Search failed'
  } finally {
    busy.value = false
  }
}

async function handlePickCandidate(candidate: YouTubeVideoCandidate) {
  busy.value = true
  error.value = null
  try {
    const mapping = await resolveTrackFromCandidate(
      props.uid,
      props.track.id,
      candidate,
      'manual',
      searchQuery.value || undefined,
    )
    emit('updated', mapping)

    if (useChannelForArtist.value && candidate.channelId) {
      await saveChannelPreference({
        channelId: candidate.channelId,
        channelTitle: candidate.channelTitle,
      })
    }

    expanded.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save mapping'
  } finally {
    busy.value = false
  }
}

async function handleManualSave() {
  busy.value = true
  error.value = null
  try {
    const mapping = await resolveTrackFromVideoInput(props.uid, props.track.id, manualInput.value)
    emit('updated', mapping)

    if (useChannelForArtist.value) {
      const video = await getVideoById(mapping.videoId)
      if (video?.channelId) {
        await saveChannelPreference({
          channelId: video.channelId,
          channelTitle: video.channelTitle,
        })
      }
    }

    manualInput.value = ''
    expanded.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Invalid video'
  } finally {
    busy.value = false
  }
}

async function handleUseMappingChannel() {
  if (!props.mapping) return

  busy.value = true
  error.value = null
  try {
    const video = await getVideoById(props.mapping.videoId)
    if (!video?.channelId) {
      error.value = 'Could not load channel for this video'
      return
    }
    await saveChannelPreference({
      channelId: video.channelId,
      channelTitle: video.channelTitle,
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save channel preference'
  } finally {
    busy.value = false
  }
}

async function handleClear() {
  busy.value = true
  error.value = null
  try {
    await deleteTrackMapping(props.uid, props.track.id)
    emit('updated', null)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to clear mapping'
  } finally {
    busy.value = false
  }
}

function defaultSearchQuery(): string {
  if (props.resolveContext.preferredChannelId) {
    return buildChannelScopedSearchQuery(props.track.title)
  }
  return buildAutoSearchQuery(props.resolveContext.artistDisplay, props.track.title)
}

function toggleExpanded() {
  expanded.value = !expanded.value
  if (expanded.value && !searchQuery.value) {
    searchQuery.value = defaultSearchQuery()
  }
}
</script>

<template>
  <div class="flex flex-col items-end gap-2">
    <div class="flex items-center gap-2">
      <span
        v-if="mapping"
        class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"
        :title="mapping.videoTitle"
      >
        Resolved
      </span>
      <span
        v-else
        class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200"
      >
        Unresolved
      </span>
      <button
        type="button"
        class="text-xs text-text-muted transition-colors hover:text-text"
        :disabled="busy"
        @click="toggleExpanded"
      >
        {{ expanded ? 'Close' : 'Resolve' }}
      </button>
    </div>

    <div
      v-if="expanded"
      class="w-full max-w-md rounded-lg border border-border bg-surface p-3 text-left"
    >
      <div v-if="mapping" class="mb-3 text-xs text-text-muted">
        <p class="truncate font-medium text-text">{{ mapping.videoTitle }}</p>
        <p v-if="mapping.channelTitle">{{ mapping.channelTitle }}</p>
        <p>{{ mapping.source }} · {{ mapping.videoId }}</p>
        <button
          v-if="canSetChannelFromMapping"
          type="button"
          class="mt-2 rounded bg-white/10 px-2 py-1 text-xs transition-colors hover:bg-white/15 disabled:opacity-50"
          :disabled="busy"
          @click="handleUseMappingChannel"
        >
          Use this channel for {{ artistName }}
        </button>
        <p v-else-if="isMappingChannelPreferred" class="mt-2 text-emerald-300">
          Preferred channel for {{ artistName }}
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded bg-accent/20 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/30 disabled:opacity-50"
          :disabled="busy"
          @click="handleAutoResolve"
        >
          Auto-resolve
        </button>
        <button
          v-if="mapping"
          type="button"
          class="rounded px-2.5 py-1 text-xs text-text-muted transition-colors hover:bg-white/5 hover:text-red-300 disabled:opacity-50"
          :disabled="busy"
          @click="handleClear"
        >
          Clear
        </button>
      </div>

      <form class="mt-3 flex gap-2" @submit.prevent="handleSearch">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search YouTube…"
          class="min-w-0 flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-xs outline-none focus:border-accent"
        />
        <button
          type="submit"
          class="rounded bg-white/10 px-2.5 py-1.5 text-xs transition-colors hover:bg-white/15 disabled:opacity-50"
          :disabled="busy"
        >
          Search
        </button>
      </form>

      <label
        v-if="candidates.length || manualInput.trim()"
        class="mt-3 flex cursor-pointer items-center gap-2 text-xs text-text-muted"
      >
        <input
          v-model="useChannelForArtist"
          type="checkbox"
          class="rounded border-border"
        />
        Use this channel for {{ artistName }}
      </label>

      <ul v-if="candidates.length" class="mt-2 max-h-40 divide-y divide-border overflow-y-auto rounded border border-border">
        <li v-for="candidate in candidates" :key="candidate.videoId">
          <button
            type="button"
            class="w-full px-2 py-2 text-left text-xs transition-colors hover:bg-white/5"
            :disabled="busy"
            @click="handlePickCandidate(candidate)"
          >
            <span class="block truncate font-medium">{{ candidate.title }}</span>
            <span class="block truncate text-text-muted">
              {{ candidate.channelTitle }}
              <template v-if="candidate.durationMs">
                · {{ formatDuration(candidate.durationMs) }}
              </template>
              <template v-if="resolveContext.preferredChannelId === candidate.channelId">
                · preferred
              </template>
            </span>
          </button>
        </li>
      </ul>

      <form class="mt-3 flex gap-2" @submit.prevent="handleManualSave">
        <input
          v-model="manualInput"
          type="text"
          placeholder="Paste YouTube URL or video ID"
          class="min-w-0 flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-xs outline-none focus:border-accent"
        />
        <button
          type="submit"
          class="rounded bg-white/10 px-2.5 py-1.5 text-xs transition-colors hover:bg-white/15 disabled:opacity-50"
          :disabled="busy || !manualInput.trim()"
        >
          Save
        </button>
      </form>

      <p v-if="error" class="mt-2 text-xs text-red-300">{{ error }}</p>
    </div>
  </div>
</template>
