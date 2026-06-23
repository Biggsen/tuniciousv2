<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import TrackResolvePanel from '@/components/youtube/TrackResolvePanel.vue'
import {
  clearArtistPreferredYouTubeChannel,
  getArtistById,
} from '@/lib/artist/firestore'
import { formatDuration } from '@/lib/musicbrainz/format'
import { getAlbumById } from '@/lib/album/firestore'
import { buildArtistResolveContext } from '@/lib/youtube/context'
import { deleteMappingsForTrackIds, getMappingsForTrackIds } from '@/lib/youtube/firestore'
import { parsePlaylistIdFromInput } from '@/lib/youtube/parseUrl'
import {
  findAndResolveAlbumFromPlaylist,
  resolveAlbumFromYouTubePlaylist,
} from '@/lib/youtube/playlistResolve'
import { resolveAllAlbumTracks } from '@/lib/youtube/resolve'
import { useAuthStore } from '@/stores/auth'
import type { Album, Artist } from '@/types/library'
import type { TrackYouTubeMapping } from '@/types/youtube'

const route = useRoute()
const auth = useAuthStore()

const album = ref<Album | null>(null)
const primaryArtist = ref<Artist | null>(null)
const mappings = ref<Map<string, TrackYouTubeMapping>>(new Map())
const loading = ref(true)
const error = ref<string | null>(null)
const resolvingAll = ref(false)
const resolveAllProgress = ref('')
const resolvingPlaylist = ref(false)
const playlistProgress = ref('')
const playlistInput = ref('')
const playlistMessage = ref<string | null>(null)

const resolveContext = computed(() => {
  if (!album.value) return null
  return buildArtistResolveContext(album.value, primaryArtist.value)
})

const resolvedCount = computed(() => {
  if (!album.value) return 0
  return album.value.tracks.filter((track) => mappings.value.has(track.id)).length
})

const artistName = computed(() => primaryArtist.value?.name ?? album.value?.artist ?? '')

async function loadMappings() {
  if (!auth.user || !album.value) return
  mappings.value = await getMappingsForTrackIds(
    auth.user.uid,
    album.value.tracks.map((track) => track.id),
  )
}

async function load() {
  if (!auth.user) return

  loading.value = true
  error.value = null

  try {
    album.value = await getAlbumById(auth.user.uid, String(route.params.id))
    if (!album.value) {
      error.value = 'Album not found'
      return
    }
    primaryArtist.value = await getArtistById(auth.user.uid, album.value.artistId)
    await loadMappings()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load album'
  } finally {
    loading.value = false
  }
}

function onMappingUpdated(trackId: string, mapping: TrackYouTubeMapping | null) {
  const next = new Map(mappings.value)
  if (mapping) {
    next.set(trackId, mapping)
  } else {
    next.delete(trackId)
  }
  mappings.value = next
}

function onChannelPreferenceUpdated(artist: Artist) {
  primaryArtist.value = artist
}

async function handleClearAllResolves() {
  if (!auth.user || !album.value || !resolvedCount.value) return

  error.value = null
  playlistMessage.value = null

  try {
    await deleteMappingsForTrackIds(
      auth.user.uid,
      album.value.tracks.map((track) => track.id),
    )
    mappings.value = new Map()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to clear resolves'
  }
}

async function handleClearPreferredChannel() {
  if (!auth.user || !album.value) return

  try {
    primaryArtist.value = await clearArtistPreferredYouTubeChannel(
      auth.user.uid,
      album.value.artistId,
    )
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to clear channel preference'
  }
}

async function applyPlaylistResolveResult(
  result: Awaited<ReturnType<typeof resolveAlbumFromYouTubePlaylist>>,
) {
  album.value = await getAlbumById(auth.user!.uid, album.value!.id)
  await loadMappings()

  const unmatched =
    result.unmatchedTracks.length > 0
      ? ` (${result.unmatchedTracks.length} unmatched: ${result.unmatchedTracks.map((t) => t.title).join(', ')})`
      : ''

  playlistMessage.value = `Resolved ${result.resolved}/${result.total} from “${result.playlist.title}”${unmatched}`
}

async function handleResolveFromPlaylist() {
  if (!auth.user || !album.value || !resolveContext.value) return

  resolvingPlaylist.value = true
  playlistProgress.value = ''
  playlistMessage.value = null
  error.value = null

  try {
    const result = album.value.youtubePlaylistId
      ? await resolveAlbumFromYouTubePlaylist(
          auth.user.uid,
          album.value,
          album.value.youtubePlaylistId,
          album.value.tracks,
          (completed, total) => {
            playlistProgress.value = `${completed}/${total}`
          },
        )
      : await findAndResolveAlbumFromPlaylist(
          auth.user.uid,
          album.value,
          resolveContext.value,
          artistName.value,
          album.value.tracks,
          (completed, total) => {
            playlistProgress.value = `${completed}/${total}`
          },
        )

    await applyPlaylistResolveResult(result)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Playlist resolve failed'
  } finally {
    resolvingPlaylist.value = false
    playlistProgress.value = ''
  }
}

async function handleLinkPlaylistAndResolve() {
  if (!auth.user || !album.value) return

  const playlistId = parsePlaylistIdFromInput(playlistInput.value)
  if (!playlistId) {
    error.value = 'Invalid YouTube playlist URL or ID'
    return
  }

  resolvingPlaylist.value = true
  playlistProgress.value = ''
  playlistMessage.value = null
  error.value = null

  try {
    const result = await resolveAlbumFromYouTubePlaylist(
      auth.user.uid,
      album.value,
      playlistId,
      album.value.tracks,
      (completed, total) => {
        playlistProgress.value = `${completed}/${total}`
      },
    )
    playlistInput.value = ''
    await applyPlaylistResolveResult(result)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Playlist resolve failed'
  } finally {
    resolvingPlaylist.value = false
    playlistProgress.value = ''
  }
}

async function handleResolveAll() {
  if (!auth.user || !album.value || !resolveContext.value) return

  const unresolved = album.value.tracks.filter((track) => !mappings.value.has(track.id))
  if (!unresolved.length) return

  resolvingAll.value = true
  resolveAllProgress.value = ''
  error.value = null

  try {
    await resolveAllAlbumTracks(
      auth.user.uid,
      resolveContext.value,
      unresolved,
      (completed, total) => {
        resolveAllProgress.value = `${completed}/${total}`
      },
    )
    await loadMappings()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Resolve-all failed'
  } finally {
    resolvingAll.value = false
    resolveAllProgress.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div>
    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error && !album" :message="error" />
    <template v-else-if="album && resolveContext">
      <header class="mb-6 flex gap-6">
        <div class="h-40 w-40 shrink-0 overflow-hidden rounded-xl bg-surface-raised">
          <img
            v-if="album.coverUrl"
            :src="album.coverUrl"
            :alt="album.title"
            class="h-full w-full object-cover"
          />
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-2xl font-semibold">{{ album.title }}</h2>
          <p class="mt-1 text-sm text-text-muted">{{ album.artist }}</p>
          <p class="mt-2 text-xs text-text-muted">
            <template v-if="album.albumYear">{{ album.albumYear }}</template>
            <template v-if="album.type"> · {{ album.type }}</template>
            <template v-if="album.artistIds.length > 1">
              · {{ album.artistIds.length }} artists
            </template>
          </p>
          <p
            v-if="primaryArtist?.preferredYouTubeChannelTitle"
            class="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted"
          >
            <span class="rounded-full bg-accent/15 px-2 py-0.5 text-accent">
              Preferred channel: {{ primaryArtist.preferredYouTubeChannelTitle }}
            </span>
            <button
              type="button"
              class="text-text-muted transition-colors hover:text-text"
              @click="handleClearPreferredChannel"
            >
              Clear
            </button>
          </p>
          <p
            v-if="album.youtubePlaylistTitle"
            class="mt-2 text-xs text-text-muted"
          >
            YouTube playlist: {{ album.youtubePlaylistTitle }}
          </p>
          <p class="mt-3 text-xs text-text-muted">
            Imported {{ album.importedAt.toLocaleDateString() }}
          </p>
          <p class="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span
              class="rounded-full px-2 py-0.5 text-xs"
              :class="
                resolvedCount === album.tracks.length
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-200'
              "
            >
              {{ resolvedCount }}/{{ album.tracks.length }} tracks resolved
            </span>
            <button
              v-if="resolvedCount > 0"
              type="button"
              class="text-xs text-text-muted transition-colors hover:text-red-300"
              @click="handleClearAllResolves"
            >
              Clear resolves
            </button>
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
              :disabled="resolvingPlaylist || resolvingAll"
              @click="handleResolveFromPlaylist"
            >
              {{
                resolvingPlaylist
                  ? `Resolving from playlist… ${playlistProgress}`
                  : album.youtubePlaylistId
                    ? 'Resolve from playlist'
                    : 'Find Topic playlist & resolve'
              }}
            </button>
            <button
              v-if="resolvedCount < album.tracks.length"
              type="button"
              class="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
              :disabled="resolvingAll || resolvingPlaylist"
              @click="handleResolveAll"
            >
              {{
                resolvingAll
                  ? `Resolving… ${resolveAllProgress}`
                  : 'Resolve all (search)'
              }}
            </button>
          </div>
          <form
            class="mt-3 flex max-w-lg flex-wrap gap-2"
            @submit.prevent="handleLinkPlaylistAndResolve"
          >
            <input
              v-model="playlistInput"
              type="text"
              placeholder="Paste YouTube playlist URL"
              class="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              class="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
              :disabled="resolvingPlaylist || !playlistInput.trim()"
            >
              Link & resolve
            </button>
          </form>
          <p v-if="playlistMessage" class="mt-2 text-xs text-emerald-300">
            {{ playlistMessage }}
          </p>
        </div>
      </header>

      <p v-if="error" class="mb-4 text-sm text-red-300">{{ error }}</p>

      <h3 class="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">Tracklist</h3>
      <ol class="divide-y divide-border rounded-xl border border-border">
        <li
          v-for="track in album.tracks"
          :key="track.id"
          class="flex items-start gap-4 px-4 py-3 text-sm"
        >
          <span class="w-8 shrink-0 pt-0.5 text-right text-text-muted tabular-nums">
            {{ track.trackNumber }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ track.title }}</p>
            <p class="text-xs text-text-muted tabular-nums">{{ formatDuration(track.lengthMs) }}</p>
          </div>
          <TrackResolvePanel
            v-if="auth.user"
            :uid="auth.user.uid"
            :artist-id="album.artistId"
            :artist-name="artistName"
            :resolve-context="resolveContext"
            :track="track"
            :mapping="mappings.get(track.id) ?? null"
            @updated="(mapping) => onMappingUpdated(track.id, mapping)"
            @channel-preference-updated="onChannelPreferenceUpdated"
          />
        </li>
      </ol>
    </template>
  </div>
</template>
