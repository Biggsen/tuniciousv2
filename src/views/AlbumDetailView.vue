<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import ExplorerError from '@/components/explorer/ExplorerError.vue'
import ExplorerLoading from '@/components/explorer/ExplorerLoading.vue'
import AlbumPipelineHistory from '@/components/album/AlbumPipelineHistory.vue'
import AlbumRatingStars from '@/components/album/AlbumRatingStars.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import TrackLovedHeart from '@/components/lastfm/TrackLovedHeart.vue'
import TrackResolvePanel from '@/components/youtube/TrackResolvePanel.vue'
import {
  clearArtistPreferredYouTubeChannel,
  getArtistById,
} from '@/lib/artist/firestore'
import { formatDuration } from '@/lib/musicbrainz/format'
import { archiveAlbum, isAlbumArchived, unarchiveAlbum } from '@/lib/album/archive'
import {
  excludeTrackFromAlbum,
  getAlbumById,
  updateAlbumCoverUrls,
  updateAlbumRating,
  updateAlbumTitle,
  updateTrackTitle,
} from '@/lib/album/firestore'
import { coverUrlsFromManualUrl, hasCoverUrls, pickAlbumCoverLarge, resolveAlbumCoverUrls } from '@/lib/album/coverArt'
import { isAdminUid } from '@/lib/auth/admin'
import { isLastfmConnected, refreshAlbumPlaycounts, setTrackLoved } from '@/lib/lastfm/scrobble'
import { resolveAlbumRatingDisplay } from '@/lib/pipeline/rating'
import {
  getAlbumEvaluationStageContext,
  type AlbumEvaluationStageContext,
} from '@/lib/pipeline/ratingContext'
import { lastfmAlbumUrl, rymSearchUrl } from '@/lib/playlist/externalLinks'
import { buildArtistResolveContext } from '@/lib/youtube/context'
import { getTrackPlayStatsMap } from '@/lib/sessions/firestore'
import { deleteMappingsForTrackIds, getMappingsForTrackIds } from '@/lib/youtube/firestore'
import { parsePlaylistIdFromInput } from '@/lib/youtube/parseUrl'
import {
  resolveAlbumFromYouTubePlaylist,
  resolveAlbumViaArtistChannel,
} from '@/lib/youtube/playlistResolve'
import { resolveAllAlbumTracks } from '@/lib/youtube/resolve'
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import { usePlaybackStore } from '@/stores/playback'
import { usePlayStatsStore } from '@/stores/playStats'
import { usePlaylistDetailStore } from '@/stores/playlistDetail'
import type { Album, Artist, Track } from '@/types/library'
import type { StarRating } from '@/types/pipeline'
import type { TrackYouTubeMapping } from '@/types/youtube'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const library = useLibraryStore()
const playback = usePlaybackStore()
const playStats = usePlayStatsStore()

const backLink = computed(() => {
  const playlistId = route.query.playlistId
  if (typeof playlistId === 'string' && playlistId) {
    return {
      to: { name: 'playlist-detail', params: { id: playlistId } },
      label: 'Playlist',
    }
  }
  return {
    to: { name: 'library' },
    label: 'Library',
  }
})

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
const playError = ref<string | null>(null)
const lastfmConnected = ref(false)
const refreshingPlaycounts = ref(false)
const playcountMessage = ref<string | null>(null)
const togglingLovedIds = ref<Set<string>>(new Set())
const archiveDialogOpen = ref(false)
const archiving = ref(false)
const trackPendingDelete = ref<{ id: string; title: string } | null>(null)
const deletingTrack = ref(false)
const titleDraft = ref('')
const savingTitle = ref(false)
const titleError = ref<string | null>(null)
const editingTitle = ref(false)
const albumTitleInput = ref<HTMLInputElement | null>(null)
const trackTitleDrafts = ref<Record<string, string>>({})
const savingTrackId = ref<string | null>(null)
const trackTitleError = ref<string | null>(null)
const trackTitleErrorId = ref<string | null>(null)
const editingTrackId = ref<string | null>(null)
const trackTitleInput = ref<HTMLInputElement | null>(null)
const fetchingCover = ref(false)
const coverFetchError = ref<string | null>(null)
const coverUrlDialogOpen = ref(false)
const coverUrlDraft = ref('')
const coverUrlError = ref<string | null>(null)
const savingCoverUrl = ref(false)

const isAdmin = computed(() => isAdminUid(auth.user?.uid))
const isArchived = computed(() => (album.value ? isAlbumArchived(album.value) : false))
const playlistDetail = usePlaylistDetailStore()

const resolveContext = computed(() => {
  if (!album.value) return null
  return buildArtistResolveContext(album.value, primaryArtist.value)
})

const resolvedCount = computed(() => {
  if (!album.value) return 0
  return album.value.tracks.filter((track) => mappings.value.has(track.id)).length
})

const artistName = computed(() => primaryArtist.value?.name ?? album.value?.artist ?? '')

const lastfmArtistOverride = computed(() => {
  const override = primaryArtist.value?.scrobbleName?.trim()
  if (!override) return null
  if (override.toLowerCase() === artistName.value.trim().toLowerCase()) return null
  return override
})

const lastfmLookupArtist = computed(() => {
  const override = primaryArtist.value?.scrobbleName?.trim()
  return override || artistName.value
})

const lastfmUsername = computed(() => auth.profile?.lastfm?.username)

const hasCover = computed(() => (album.value ? Boolean(pickAlbumCoverLarge(album.value)) : false))

const evaluationStage = ref<AlbumEvaluationStageContext | null>(null)

const ratingDisplay = computed(() =>
  album.value
    ? resolveAlbumRatingDisplay(album.value, {
        stageName: evaluationStage.value?.stageName,
        pipelineRole: evaluationStage.value?.pipelineRole,
      })
    : null,
)

async function startEditAlbumTitle() {
  if (!album.value) return
  titleDraft.value = album.value.title
  titleError.value = null
  editingTrackId.value = null
  editingTitle.value = true
  await nextTick()
  albumTitleInput.value?.focus()
  albumTitleInput.value?.select()
}

function cancelEditAlbumTitle() {
  if (!album.value) return
  titleDraft.value = album.value.title
  titleError.value = null
  editingTitle.value = false
}

async function handleSaveTitle() {
  if (!auth.user || !album.value || savingTitle.value) return
  titleError.value = null
  savingTitle.value = true
  try {
    album.value = await updateAlbumTitle(auth.user.uid, album.value.id, titleDraft.value)
    titleDraft.value = album.value.title
    library.patchCardTitle(album.value.id, album.value.title)
    playlistDetail.patchAlbumTitle?.(album.value.id, album.value.title)
    editingTitle.value = false
  } catch (err) {
    titleError.value = err instanceof Error ? err.message : 'Failed to update title'
  } finally {
    savingTitle.value = false
  }
}

async function handleGetCover() {
  if (!auth.user || !album.value || fetchingCover.value) return
  coverFetchError.value = null
  fetchingCover.value = true
  try {
    const covers = await resolveAlbumCoverUrls({
      releaseMbid: album.value.releaseMbid,
      artist: album.value.artist,
      title: album.value.title,
      extraArtists: primaryArtist.value?.name ? [primaryArtist.value.name] : [],
    })
    if (!hasCoverUrls(covers)) {
      coverFetchError.value = 'No cover art found'
      return
    }
    album.value = await updateAlbumCoverUrls(auth.user.uid, album.value.id, covers)
    applyCoverToCaches(album.value)
  } catch (err) {
    coverFetchError.value = err instanceof Error ? err.message : 'Failed to fetch cover'
  } finally {
    fetchingCover.value = false
  }
}

function applyCoverToCaches(next: Album) {
    library.patchCardCover(next.id, next.coverUrlLarge ?? next.coverUrlSmall)
  playlistDetail.patchAlbumCovers?.(next.id, {
    coverUrlSmall: next.coverUrlSmall,
    coverUrlLarge: next.coverUrlLarge,
  })
}

function openCoverUrlDialog() {
  coverUrlDraft.value = album.value ? (pickAlbumCoverLarge(album.value) ?? '') : ''
  coverUrlError.value = null
  coverUrlDialogOpen.value = true
}

function closeCoverUrlDialog() {
  if (savingCoverUrl.value) return
  coverUrlDialogOpen.value = false
  coverUrlError.value = null
}

async function handleSaveCoverUrl() {
  if (!auth.user || !album.value || savingCoverUrl.value) return
  coverUrlError.value = null
  savingCoverUrl.value = true
  try {
    const covers = coverUrlsFromManualUrl(coverUrlDraft.value)
    album.value = await updateAlbumCoverUrls(auth.user.uid, album.value.id, covers)
    applyCoverToCaches(album.value)
    coverFetchError.value = null
    coverUrlDialogOpen.value = false
  } catch (err) {
    coverUrlError.value = err instanceof Error ? err.message : 'Failed to save cover URL'
  } finally {
    savingCoverUrl.value = false
  }
}

function syncTrackTitleDrafts(tracks: Track[]) {
  const drafts: Record<string, string> = {}
  for (const track of tracks) {
    drafts[track.id] = track.title
  }
  trackTitleDrafts.value = drafts
}

function isTrackTitleDirty(track: Track): boolean {
  return (trackTitleDrafts.value[track.id] ?? '').trim() !== track.title
}

function setTrackTitleInput(el: unknown) {
  trackTitleInput.value = el instanceof HTMLInputElement ? el : null
}

async function startEditTrackTitle(track: Track) {
  editingTitle.value = false
  trackTitleDrafts.value = { ...trackTitleDrafts.value, [track.id]: track.title }
  trackTitleError.value = null
  trackTitleErrorId.value = null
  editingTrackId.value = track.id
  await nextTick()
  trackTitleInput.value?.focus()
  trackTitleInput.value?.select()
}

function cancelEditTrackTitle(track: Track) {
  trackTitleDrafts.value = { ...trackTitleDrafts.value, [track.id]: track.title }
  if (trackTitleErrorId.value === track.id) {
    trackTitleError.value = null
    trackTitleErrorId.value = null
  }
  if (editingTrackId.value === track.id) editingTrackId.value = null
}

async function handleSaveTrackTitle(track: Track) {
  if (!auth.user || !album.value || savingTrackId.value) return
  trackTitleError.value = null
  trackTitleErrorId.value = null
  savingTrackId.value = track.id
  try {
    album.value = await updateTrackTitle(
      auth.user.uid,
      album.value.id,
      track.id,
      trackTitleDrafts.value[track.id] ?? '',
    )
    const updated = album.value.tracks.find((item) => item.id === track.id)
    if (updated) {
      trackTitleDrafts.value = { ...trackTitleDrafts.value, [track.id]: updated.title }
      playlistDetail.patchTrackTitle?.(album.value.id, track.id, updated.title)
      playback.patchTrackTitle?.(track.id, updated.title)
    }
    editingTrackId.value = null
  } catch (err) {
    trackTitleErrorId.value = track.id
    trackTitleError.value = err instanceof Error ? err.message : 'Failed to update track title'
  } finally {
    savingTrackId.value = null
  }
}

async function handleRatingChange(next: StarRating | null) {
  if (!auth.user || !album.value || !ratingDisplay.value?.editable) return
  try {
    album.value = await updateAlbumRating(
      auth.user.uid,
      album.value.id,
      next,
      next === null ? null : 'manual',
    )
    library.patchCardRating(album.value.id, {
      rating: album.value.rating,
      ratingSource: album.value.ratingSource,
      ratingSubmittedPipelineId: album.value.ratingSubmittedPipelineId,
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update rating'
  }
}

async function loadMappings() {
  if (!auth.user || !album.value) return
  const trackIds = album.value.tracks.map((track) => track.id)
  const [loadedMappings, loadedStats] = await Promise.all([
    getMappingsForTrackIds(auth.user.uid, trackIds),
    getTrackPlayStatsMap(auth.user.uid, trackIds),
  ])
  mappings.value = loadedMappings
  playStats.hydrate(loadedStats)
  library.upsertMappings(loadedMappings.values())
}

function trackPlaycount(trackId: string): number {
  return playStats.byTrackId.get(trackId)?.playcount ?? 0
}

function isTrackLoved(trackId: string): boolean {
  return playStats.byTrackId.get(trackId)?.loved === true
}

function isTogglingLoved(trackId: string): boolean {
  return togglingLovedIds.value.has(trackId)
}

async function handleToggleLoved(track: Track) {
  if (!auth.user || !album.value || !lastfmConnected.value) return

  const nextLoved = !isTrackLoved(track.id)
  togglingLovedIds.value = new Set(togglingLovedIds.value).add(track.id)
  playStats.setLoved(track.id, nextLoved)

  try {
    await setTrackLoved(auth.user.uid, album.value, track, nextLoved)
  } catch (err) {
    playStats.setLoved(track.id, !nextLoved)
    error.value = err instanceof Error ? err.message : 'Failed to update Last.fm love'
  } finally {
    const next = new Set(togglingLovedIds.value)
    next.delete(track.id)
    togglingLovedIds.value = next
  }
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
    titleDraft.value = album.value.title
    titleError.value = null
    editingTitle.value = false
    coverFetchError.value = null
    syncTrackTitleDrafts(album.value.tracks)
    editingTrackId.value = null
    trackTitleError.value = null
    trackTitleErrorId.value = null
    primaryArtist.value = await getArtistById(auth.user.uid, album.value.artistId)
    lastfmConnected.value = await isLastfmConnected(auth.user.uid)
    evaluationStage.value = await getAlbumEvaluationStageContext(auth.user.uid, album.value.id)
    await loadMappings()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load album'
  } finally {
    loading.value = false
  }
}

async function handleRefreshPlaycounts() {
  if (!auth.user || !album.value || !lastfmConnected.value) return

  refreshingPlaycounts.value = true
  playcountMessage.value = null
  error.value = null

  try {
    const synced = await refreshAlbumPlaycounts(auth.user.uid, album.value)
    await loadMappings()
    playcountMessage.value = `Synced playcounts for ${synced}/${album.value.tracks.length} tracks`
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to refresh playcounts'
  } finally {
    refreshingPlaycounts.value = false
  }
}

function onMappingUpdated(trackId: string, mapping: TrackYouTubeMapping | null) {
  const next = new Map(mappings.value)
  if (mapping) {
    next.set(trackId, mapping)
    library.upsertMappings([mapping])
  } else {
    next.delete(trackId)
    library.removeMappingTrackIds([trackId])
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
    const trackIds = album.value.tracks.map((track) => track.id)
    await deleteMappingsForTrackIds(auth.user.uid, trackIds)
    mappings.value = new Map()
    library.removeMappingTrackIds(trackIds)
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
  if (result.preferredChannelArtist) {
    primaryArtist.value = result.preferredChannelArtist
  }
  await loadMappings()

  const unmatched =
    result.unmatchedTracks.length > 0
      ? ` (${result.unmatchedTracks.length} unmatched: ${result.unmatchedTracks.map((t) => t.title).join(', ')})`
      : ''

  playlistMessage.value = `Resolved ${result.resolved}/${result.total} from “${result.playlist.title}”${unmatched}`
}

async function handlePlay() {
  if (!auth.user || !album.value) return
  playError.value = null
  const started = await playback.playFromAlbum(album.value, auth.user.uid)
  if (!started) {
    playError.value = playback.error ?? 'No resolved tracks to play'
  }
}

async function handlePlayTrack(index: number) {
  if (!auth.user || !album.value) return
  const track = album.value.tracks[index]
  if (!track) return

  playError.value = null

  if (isCurrentTrack(track.id)) {
    playback.togglePlayPause()
    return
  }

  const started = await playback.playFromAlbumAtTrack(album.value, auth.user.uid, index)
  if (!started) {
    playError.value = playback.error ?? 'This track is not resolved'
  }
}

function isTrackResolved(trackId: string): boolean {
  return mappings.value.has(trackId)
}

function isCurrentTrack(trackId: string): boolean {
  if (!album.value || !playback.showPlayerBar) return false
  const current = playback.currentItem
  return current?.trackId === trackId && current.albumId === album.value.id
}

function isTrackPlaying(trackId: string): boolean {
  return isCurrentTrack(trackId) && playback.isPlaying
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
      : await resolveAlbumViaArtistChannel(
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

async function handleArchive() {
  if (!auth.user || !album.value) return

  archiving.value = true
  error.value = null

  try {
    await archiveAlbum(auth.user.uid, album.value.id)
    library.removeCard(album.value.id)
    playlistDetail.invalidate()
    await router.push(backLink.value.to)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to archive album'
  } finally {
    archiving.value = false
    archiveDialogOpen.value = false
  }
}

async function handleUnarchive() {
  if (!auth.user || !album.value) return

  archiving.value = true
  error.value = null

  try {
    await unarchiveAlbum(auth.user.uid, album.value.id)
    album.value = await getAlbumById(auth.user.uid, album.value.id)
    library.invalidate()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to restore album'
  } finally {
    archiving.value = false
  }
}

function requestRemoveTrack(track: { id: string; title: string }) {
  trackPendingDelete.value = track
}

async function handleRemoveTrack() {
  if (!auth.user || !album.value || !trackPendingDelete.value) return

  deletingTrack.value = true
  error.value = null

  const trackId = trackPendingDelete.value.id
  try {
    album.value = await excludeTrackFromAlbum(auth.user.uid, album.value.id, trackId)
    syncTrackTitleDrafts(album.value.tracks)
    mappings.value.delete(trackId)
    mappings.value = new Map(mappings.value)
    library.removeMappingTrackIds([trackId])
    library.invalidate()
    const playlistId = route.query.playlistId
    if (typeof playlistId === 'string' && playlistId) {
      playlistDetail.invalidate(playlistId)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to remove track'
  } finally {
    deletingTrack.value = false
    trackPendingDelete.value = null
  }
}

onMounted(load)
</script>

<template>
  <div>
    <ExplorerLoading v-if="loading" />
    <ExplorerError v-else-if="error && !album" :message="error" />
    <template v-else-if="album && resolveContext">
      <RouterLink
        :to="backLink.to"
        class="mb-4 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text"
      >
        ← {{ backLink.label }}
      </RouterLink>

      <div
        v-if="isArchived"
        class="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        <p>This album is archived and hidden from the library.</p>
        <button
          v-if="isAdmin"
          type="button"
          class="mt-2 text-xs font-medium text-amber-200 underline-offset-2 hover:underline disabled:opacity-50"
          :disabled="archiving"
          @click="handleUnarchive"
        >
          {{ archiving ? 'Restoring…' : 'Restore to library' }}
        </button>
      </div>

      <header class="mb-6 flex gap-6">
        <div class="flex w-40 shrink-0 flex-col gap-2">
          <div class="relative h-40 w-40 overflow-hidden rounded-xl bg-surface-raised">
            <img
              v-if="hasCover"
              :src="pickAlbumCoverLarge(album)"
              :alt="album.title"
              class="h-full w-full object-cover"
            />
          </div>
          <p v-if="coverFetchError" class="text-xs text-red-300">{{ coverFetchError }}</p>
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            <button
              type="button"
              class="text-xs font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50"
              :disabled="fetchingCover"
              @click="handleGetCover"
            >
              {{ fetchingCover ? 'Looking…' : 'Get cover' }}
            </button>
            <button
              type="button"
              class="text-xs font-medium text-text-muted transition-colors hover:text-text"
              @click="openCoverUrlDialog"
            >
              Add URL
            </button>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div v-if="editingTitle" class="flex flex-wrap items-start gap-2">
            <input
              ref="albumTitleInput"
              v-model="titleDraft"
              type="text"
              aria-label="Album title"
              class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-2xl font-semibold outline-none focus:border-accent"
              :disabled="savingTitle"
              @keydown.enter.prevent="handleSaveTitle"
              @keydown.escape="cancelEditAlbumTitle"
            />
            <button
              type="button"
              class="mt-1 shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
              :disabled="savingTitle || !titleDraft.trim()"
              @click="handleSaveTitle"
            >
              {{ savingTitle ? 'Saving…' : 'Save' }}
            </button>
            <button
              type="button"
              class="mt-1 shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
              :disabled="savingTitle"
              @click="cancelEditAlbumTitle"
            >
              Cancel
            </button>
          </div>
          <div v-else class="flex min-w-0 items-center gap-2">
            <h2 class="min-w-0 text-2xl font-semibold">{{ album.title }}</h2>
            <button
              type="button"
              class="shrink-0 rounded p-1 text-text-muted/40 transition-colors hover:text-text-muted"
              title="Edit album title"
              aria-label="Edit album title"
              @click="startEditAlbumTitle"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path
                  d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z"
                />
              </svg>
            </button>
          </div>
          <p v-if="titleError" class="mt-1 text-xs text-red-300">{{ titleError }}</p>
          <RouterLink
            :to="{ name: 'artist-detail', params: { id: album.artistId } }"
            class="mt-1 inline-block text-sm text-text-muted transition-colors hover:text-accent"
          >
            {{ artistName }}
          </RouterLink>
          <p v-if="lastfmArtistOverride" class="mt-1 text-xs text-text-muted">
            Last.fm as {{ lastfmArtistOverride }}
          </p>
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
          <div v-if="ratingDisplay" class="mt-3">
            <AlbumRatingStars
              :rating="ratingDisplay.rating"
              :editable="ratingDisplay.editable"
              :label="ratingDisplay.label"
              @change="handleRatingChange"
            />
          </div>
          <div
            class="mt-3 flex max-w-xs items-center justify-between gap-2 rounded-lg bg-surface-raised px-3 py-2 text-xs"
          >
            <RouterLink
              :to="{ name: 'explorer-release', params: { mbid: album.releaseMbid } }"
              class="font-medium text-text-muted transition-colors hover:text-accent"
            >
              MusicBrainz
            </RouterLink>
            <a
              :href="lastfmAlbumUrl(lastfmLookupArtist, album.title, lastfmUsername)"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium text-text-muted transition-colors hover:text-accent"
            >
              Last.fm
            </a>
            <a
              :href="rymSearchUrl(artistName, album.title)"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium text-text-muted transition-colors hover:text-accent"
            >
              RYM
            </a>
          </div>
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
              :disabled="resolvedCount === 0"
              @click="handlePlay"
            >
              Play
            </button>
            <button
              v-if="lastfmConnected"
              type="button"
              class="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
              :disabled="refreshingPlaycounts"
              @click="handleRefreshPlaycounts"
            >
              {{ refreshingPlaycounts ? 'Refreshing…' : 'Refresh playcounts' }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
              :disabled="resolvingPlaylist || resolvingAll"
              @click="handleResolveFromPlaylist"
            >
              {{
                resolvingPlaylist
                  ? album.youtubePlaylistId
                    ? `Resolving from playlist… ${playlistProgress}`
                    : `Resolving via Topic channel… ${playlistProgress}`
                  : album.youtubePlaylistId
                    ? 'Resolve from playlist'
                    : 'Resolve via Topic channel'
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
            <button
              v-if="isAdmin && !isArchived"
              type="button"
              class="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              @click="archiveDialogOpen = true"
            >
              Archive
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
          <p v-if="playcountMessage" class="mt-2 text-xs text-emerald-300">
            {{ playcountMessage }}
          </p>
        </div>
      </header>

      <p v-if="playError" class="mb-4 text-sm text-red-300">{{ playError }}</p>
      <p v-if="error" class="mb-4 text-sm text-red-300">{{ error }}</p>

      <AlbumPipelineHistory
        v-if="auth.user"
        :uid="auth.user.uid"
        :album-id="album.id"
      />

      <h3 class="mb-3 mt-8 text-sm font-medium uppercase tracking-wider text-text-muted">Tracklist</h3>
      <ol class="divide-y divide-border rounded-xl border border-border">
        <li
          v-for="(track, index) in album.tracks"
          :key="track.id"
          class="grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-3 text-sm transition-colors"
          :class="isCurrentTrack(track.id) ? 'bg-accent/10' : ''"
        >
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md p-1.5 text-xs leading-none transition-colors hover:bg-white/5 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
            :disabled="!isTrackResolved(track.id)"
            :title="
              !isTrackResolved(track.id)
                ? 'Resolve track first'
                : isTrackPlaying(track.id)
                  ? 'Pause'
                  : isCurrentTrack(track.id)
                    ? 'Resume'
                    : 'Play track'
            "
            @click="handlePlayTrack(index)"
          >
            {{ isTrackPlaying(track.id) ? '⏸' : '▶' }}
          </button>
          <span class="w-8 shrink-0 text-right text-text-muted tabular-nums">
            {{ index + 1 }}
          </span>
          <div class="min-w-0 flex-1">
            <div v-if="editingTrackId === track.id" class="flex min-w-0 flex-wrap items-center gap-2">
              <input
                :ref="setTrackTitleInput"
                v-model="trackTitleDrafts[track.id]"
                type="text"
                :aria-label="`Track ${index + 1} title`"
                class="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 font-medium outline-none focus:border-accent"
                :disabled="savingTrackId === track.id"
                @keydown.enter.prevent="handleSaveTrackTitle(track)"
                @keydown.escape.prevent="cancelEditTrackTitle(track)"
              />
              <button
                type="button"
                class="shrink-0 text-xs font-medium text-accent transition-colors hover:text-accent-muted disabled:opacity-50"
                :disabled="savingTrackId === track.id || !(trackTitleDrafts[track.id] ?? '').trim()"
                @click="handleSaveTrackTitle(track)"
              >
                {{ savingTrackId === track.id ? 'Saving…' : 'Save' }}
              </button>
              <button
                type="button"
                class="shrink-0 text-xs text-text-muted transition-colors hover:text-text disabled:opacity-50"
                :disabled="savingTrackId === track.id"
                @click="cancelEditTrackTitle(track)"
              >
                Cancel
              </button>
            </div>
            <div v-else class="flex min-w-0 items-center gap-1.5">
              <p
                class="min-w-0 truncate font-medium"
                :class="isCurrentTrack(track.id) ? 'text-accent' : ''"
              >
                {{ track.title }}
              </p>
              <button
                type="button"
                class="shrink-0 rounded p-0.5 text-text-muted/35 transition-colors hover:text-text-muted"
                :title="`Edit ${track.title}`"
                :aria-label="`Edit track ${index + 1} title`"
                @click="startEditTrackTitle(track)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="h-3 w-3"
                  aria-hidden="true"
                >
                  <path
                    d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z"
                  />
                </svg>
              </button>
            </div>
            <p class="text-xs text-text-muted tabular-nums">{{ formatDuration(track.lengthMs) }}</p>
            <p
              v-if="trackTitleError && trackTitleErrorId === track.id"
              class="text-xs text-red-300"
            >
              {{ trackTitleError }}
            </p>
          </div>
          <span
            class="w-8 shrink-0 text-right text-xs tabular-nums text-text-muted"
            :title="`${trackPlaycount(track.id)} plays`"
          >
            {{ trackPlaycount(track.id) }}
          </span>
          <TrackLovedHeart
            :loved="isTrackLoved(track.id)"
            :can-toggle="lastfmConnected"
            :busy="isTogglingLoved(track.id)"
            @toggle="handleToggleLoved(track)"
          />
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
          <button
            type="button"
            class="shrink-0 text-xs text-text-muted transition-colors hover:text-red-300 disabled:opacity-50"
            :disabled="deletingTrack"
            title="Remove from tracklist"
            @click="requestRemoveTrack(track)"
          >
            Remove
          </button>
        </li>
      </ol>

      <ConfirmDialog
        :open="coverUrlDialogOpen"
        title="Add cover URL"
        message="Paste a direct link to an image. Tunicious will hotlink it, not download it."
        confirm-label="Save cover"
        :busy="savingCoverUrl"
        @confirm="handleSaveCoverUrl"
        @cancel="closeCoverUrlDialog"
      >
        <input
          v-model="coverUrlDraft"
          type="url"
          inputmode="url"
          placeholder="https://"
          aria-label="Cover image URL"
          class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          :disabled="savingCoverUrl"
          @keydown.enter.prevent="handleSaveCoverUrl"
        />
        <p v-if="coverUrlError" class="mt-2 text-xs text-red-300">{{ coverUrlError }}</p>
      </ConfirmDialog>

      <ConfirmDialog
        :open="archiveDialogOpen"
        title="Archive this album?"
        :message="`“${album.title}” will be removed from the library and from your playlists. Pipeline history is kept. You can restore it from Settings → Archived albums, but it will not rejoin playlists.`"
        confirm-label="Archive album"
        destructive
        :busy="archiving"
        @confirm="handleArchive"
        @cancel="archiveDialogOpen = false"
      />

      <ConfirmDialog
        :open="!!trackPendingDelete"
        title="Remove this track?"
        :message="`“${trackPendingDelete?.title ?? ''}” will be removed from your tracklist for this album. Other users’ catalogs are unchanged.`"
        confirm-label="Remove track"
        destructive
        :busy="deletingTrack"
        @confirm="handleRemoveTrack"
        @cancel="trackPendingDelete = null"
      />
    </template>
  </div>
</template>
