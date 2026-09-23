<script setup lang="ts">
import { computed, ref } from 'vue'

import { formatDuration } from '@/lib/musicbrainz/format'
import {
  resolveTrackFromCandidate,
  resolveTrackFromVideoInput,
  searchTrackCandidates,
} from '@/lib/youtube/resolve'
import { usePlaybackStore } from '@/stores/playback'
import type { Track } from '@/types/library'
import type { ArtistResolveContext, TrackYouTubeMapping, YouTubeVideoCandidate } from '@/types/youtube'

const props = defineProps<{
  uid: string
  artistName: string
  resolveContext: ArtistResolveContext
  track: Track
  mapping: TrackYouTubeMapping | null
}>()

const emit = defineEmits<{
  updated: [mapping: TrackYouTubeMapping | null]
}>()

const playback = usePlaybackStore()

const expanded = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')
const manualInput = ref('')
const candidates = ref<YouTubeVideoCandidate[]>([])

const correctionQuery = computed(() => `${props.artistName} ${props.track.title}`.trim())

const visibleCandidates = computed(() => {
  const currentId = props.mapping?.videoId
  return candidates.value.filter((candidate) => candidate.videoId !== currentId).slice(0, 8)
})

function isUnplayable(videoId: string): boolean {
  return playback.unplayableVideoIds.includes(videoId)
}

function isPreviewing(videoId: string): boolean {
  return playback.audition?.trackId === props.track.id && playback.audition.videoId === videoId
}

async function loadCandidates(query: string) {
  busy.value = true
  error.value = null
  try {
    candidates.value = await searchTrackCandidates(props.resolveContext, props.track, query)
    if (!visibleCandidates.value.length) {
      error.value = 'No other matches'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Search failed'
  } finally {
    busy.value = false
  }
}

async function toggleExpanded() {
  if (expanded.value) {
    if (playback.audition?.trackId === props.track.id) playback.endAudition()
    expanded.value = false
    return
  }

  expanded.value = true
  searchQuery.value = correctionQuery.value
  await loadCandidates(correctionQuery.value)
}

async function handleSearch() {
  const query = searchQuery.value.trim() || correctionQuery.value
  searchQuery.value = query
  await loadCandidates(query)
}

function handlePreview(candidate: YouTubeVideoCandidate) {
  if (isUnplayable(candidate.videoId)) return
  playback.startAudition({
    videoId: candidate.videoId,
    title: candidate.title,
    channelTitle: candidate.channelTitle,
    trackId: props.track.id,
    libraryTitle: props.track.title,
  })
}

async function commitMapping(mapping: TrackYouTubeMapping) {
  playback.adoptManualMapping(props.track.id, {
    videoId: mapping.videoId,
    channelTitle: mapping.channelTitle,
    channelId: mapping.channelId,
    durationMs: mapping.durationMs,
  })
  emit('updated', mapping)
  expanded.value = false
}

async function handleUse(candidate: YouTubeVideoCandidate) {
  if (isUnplayable(candidate.videoId)) return
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
    await commitMapping(mapping)
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
    const mapping = await resolveTrackFromVideoInput(
      props.uid,
      props.track.id,
      manualInput.value,
      'manual',
    )
    manualInput.value = ''
    await commitMapping(mapping)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Invalid video'
  } finally {
    busy.value = false
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
        {{ expanded ? 'Close' : mapping ? 'Wrong' : 'Find' }}
      </button>
    </div>

    <div
      v-if="expanded"
      class="w-full max-w-md rounded-lg border border-border bg-surface p-3 text-left"
    >
      <p v-if="mapping" class="mb-3 truncate text-xs text-text-muted">
        <span class="font-medium text-text">{{ mapping.videoTitle }}</span>
        <template v-if="mapping.channelTitle"> · {{ mapping.channelTitle }}</template>
      </p>

      <p v-if="busy && !visibleCandidates.length" class="text-xs text-text-muted">Searching…</p>

      <ul
        v-if="visibleCandidates.length"
        class="max-h-64 divide-y divide-border overflow-y-auto rounded border border-border"
      >
        <li
          v-for="candidate in visibleCandidates"
          :key="candidate.videoId"
          class="px-2 py-2 text-xs"
          :class="isPreviewing(candidate.videoId) ? 'bg-accent/10' : ''"
        >
          <span class="block truncate font-medium">{{ candidate.title }}</span>
          <span class="block truncate text-text-muted">
            {{ candidate.channelTitle }}
            <template v-if="candidate.durationMs">
              · {{ formatDuration(candidate.durationMs) }}
            </template>
          </span>
          <p v-if="isUnplayable(candidate.videoId)" class="mt-1 text-amber-200">
            Can't embed
          </p>
          <div class="mt-1.5 flex gap-2">
            <button
              type="button"
              class="rounded bg-white/10 px-2 py-1 transition-colors hover:bg-white/15 disabled:opacity-50"
              :disabled="busy || isUnplayable(candidate.videoId)"
              @click="handlePreview(candidate)"
            >
              {{ isPreviewing(candidate.videoId) ? 'Playing' : 'Preview' }}
            </button>
            <button
              type="button"
              class="rounded bg-accent/20 px-2 py-1 text-accent transition-colors hover:bg-accent/30 disabled:opacity-50"
              :disabled="busy || isUnplayable(candidate.videoId)"
              @click="handleUse(candidate)"
            >
              Use this
            </button>
          </div>
        </li>
      </ul>

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

      <form class="mt-2 flex gap-2" @submit.prevent="handleManualSave">
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
