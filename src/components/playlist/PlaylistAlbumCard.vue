<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import TrackLovedHeart from '@/components/lastfm/TrackLovedHeart.vue'
import { pickAlbumCoverSmall } from '@/lib/album/coverArt'
import { setTrackLoved } from '@/lib/lastfm/scrobble'
import { lastfmAlbumUrl, rymSearchUrl } from '@/lib/playlist/externalLinks'
import { useAuthStore } from '@/stores/auth'
import { usePlaybackStore } from '@/stores/playback'
import { usePlayStatsStore } from '@/stores/playStats'
import type { PlaylistMember, Track } from '@/types/library'
import type { WorkflowAction } from '@/types/pipeline'

const auth = useAuthStore()
const playback = usePlaybackStore()
const playStats = usePlayStatsStore()

const props = defineProps<{
  member: PlaylistMember
  playlistId: string
  showTracklist: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  workflowActions?: WorkflowAction[]
  canUndoWorkflow?: boolean
  workflowBlockedReason?: string
}>()

const emit = defineEmits<{
  remove: []
  moveUp: []
  moveDown: []
  workflowAction: [action: WorkflowAction]
  undoWorkflow: []
  playTrack: [trackId: string]
}>()

const menuOpen = ref(false)

const album = computed(() => props.member.album)

const lastfmUsername = computed(() => auth.profile?.lastfm?.username)
const lastfmConnected = computed(() => Boolean(auth.profile?.lastfm?.sessionKey))
const togglingLovedIds = ref<Set<string>>(new Set())
const lovedToggleError = ref<string | null>(null)

function isCurrentTrack(trackId: string): boolean {
  if (!playback.showPlayerBar) return false
  const current = playback.currentItem
  return current?.trackId === trackId && current.albumId === album.value.id
}

function isTrackPlaying(trackId: string): boolean {
  return isCurrentTrack(trackId) && playback.isPlaying
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
  if (!auth.user || !lastfmConnected.value) return

  const nextLoved = !isTrackLoved(track.id)
  lovedToggleError.value = null
  togglingLovedIds.value = new Set(togglingLovedIds.value).add(track.id)
  playStats.setLoved(track.id, nextLoved)

  try {
    await setTrackLoved(auth.user.uid, album.value, track, nextLoved)
  } catch (err) {
    playStats.setLoved(track.id, !nextLoved)
    lovedToggleError.value = err instanceof Error ? err.message : 'Failed to update Last.fm love'
  } finally {
    const next = new Set(togglingLovedIds.value)
    next.delete(track.id)
    togglingLovedIds.value = next
  }
}

function closeMenu() {
  menuOpen.value = false
}

const canStart = computed(() => props.workflowActions?.includes('start') ?? false)
const canYes = computed(() => props.workflowActions?.includes('yes') ?? false)
const canNo = computed(() => props.workflowActions?.includes('no') ?? false)
const showCoverWorkflow = computed(
  () => canStart.value || canYes.value || canNo.value || props.canUndoWorkflow || Boolean(props.workflowBlockedReason),
)

const overlayButtonClass =
  'absolute z-10 rounded-md bg-black/70 px-2.5 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-sm opacity-0 pointer-events-none transition-opacity transition-colors group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:bg-black/85'
</script>

<template>
  <article class="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface-raised/50">
    <div class="group relative">
      <RouterLink
        :to="{
          name: 'album-detail',
          params: { id: album.id },
          query: { playlistId },
        }"
        class="block"
      >
        <div class="aspect-square w-full overflow-hidden bg-surface">
          <img
            v-if="pickAlbumCoverSmall(album)"
            :src="pickAlbumCoverSmall(album)"
            :alt="album.title"
            loading="lazy"
            decoding="async"
            class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center text-xs text-text-muted"
          >
            No art
          </div>
        </div>
      </RouterLink>

      <template v-if="showCoverWorkflow">
        <button
          v-if="canNo"
          type="button"
          class="left-2 top-2"
          :class="overlayButtonClass"
          @click.stop="emit('workflowAction', 'no')"
        >
          No
        </button>
        <button
          v-if="canYes"
          type="button"
          class="right-2 top-2"
          :class="overlayButtonClass"
          @click.stop="emit('workflowAction', 'yes')"
        >
          Yes
        </button>
        <button
          v-if="canStart"
          type="button"
          class="right-2 top-2"
          :class="overlayButtonClass"
          @click.stop="emit('workflowAction', 'start')"
        >
          Start
        </button>
        <button
          v-if="canUndoWorkflow"
          type="button"
          class="bottom-2 right-2"
          :class="overlayButtonClass"
          @click.stop="emit('undoWorkflow')"
        >
          Undo
        </button>
        <p
          v-if="workflowBlockedReason"
          class="pointer-events-none absolute inset-x-2 bottom-2 z-10 rounded-md bg-black/70 px-2 py-1 text-[11px] text-amber-200 backdrop-blur-sm"
          :class="canUndoWorkflow ? 'right-16' : ''"
        >
          {{ workflowBlockedReason }}
        </p>
      </template>
    </div>

    <div class="flex flex-1 flex-col p-4">
      <div class="mb-3 flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p v-if="album.albumYear" class="text-xs text-text-muted">{{ album.albumYear }}</p>
          <RouterLink
            :to="{
              name: 'album-detail',
              params: { id: album.id },
              query: { playlistId },
            }"
            class="mt-0.5 block truncate text-base font-semibold transition-colors hover:text-accent"
          >
            {{ album.title }}
          </RouterLink>
          <p class="mt-0.5 truncate text-sm text-text-muted">{{ album.artist }}</p>
        </div>

        <div class="relative shrink-0">
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text"
            aria-label="Album actions"
            @click="menuOpen = !menuOpen"
          >
            ⋮
          </button>
          <div
            v-if="menuOpen"
            class="absolute right-0 z-10 mt-1 min-w-36 rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 disabled:opacity-40"
              :disabled="!canMoveUp"
              @click="emit('moveUp'); closeMenu()"
            >
              Move up
            </button>
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 disabled:opacity-40"
              :disabled="!canMoveDown"
              @click="emit('moveDown'); closeMenu()"
            >
              Move down
            </button>
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-white/5"
              @click="emit('remove'); closeMenu()"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <div v-if="showTracklist" class="mb-4 min-h-0 flex-1">
        <p class="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">Tracks</p>
        <ul class="text-sm">
          <li
            v-for="track in album.tracks"
            :key="track.id"
            class="flex items-center gap-1 rounded-md px-0.5 transition-colors"
            :class="isCurrentTrack(track.id) ? 'bg-accent/10' : ''"
          >
            <button
              type="button"
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] leading-none transition-colors hover:bg-white/5 hover:text-accent"
              :title="
                isTrackPlaying(track.id)
                  ? 'Pause'
                  : isCurrentTrack(track.id)
                    ? 'Resume'
                    : 'Play track'
              "
              @click="emit('playTrack', track.id)"
            >
              {{ isTrackPlaying(track.id) ? '⏸' : '▶' }}
            </button>
            <span
              class="min-w-0 flex-1 truncate"
              :class="isCurrentTrack(track.id) ? 'text-accent' : ''"
            >
              {{ track.title }}
            </span>
            <span class="shrink-0 tabular-nums text-xs text-text-muted">
              {{ trackPlaycount(track.id) }}
            </span>
            <TrackLovedHeart
              :loved="isTrackLoved(track.id)"
              :can-toggle="lastfmConnected"
              :busy="isTogglingLoved(track.id)"
              @toggle="handleToggleLoved(track)"
            />
          </li>
        </ul>
        <p v-if="lovedToggleError" class="mt-2 text-xs text-red-300">{{ lovedToggleError }}</p>
      </div>

      <div class="mt-auto">
        <p class="text-xs text-text-muted">
          {{ album.tracks.length }} track{{ album.tracks.length === 1 ? '' : 's' }}
        </p>

        <div
          class="mt-3 flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-xs"
        >
          <RouterLink
            v-if="album.releaseMbid"
            :to="{ name: 'explorer-release', params: { mbid: album.releaseMbid } }"
            class="font-medium text-text-muted transition-colors hover:text-accent"
          >
            MusicBrainz
          </RouterLink>
          <span v-else class="font-medium text-text-muted/40">MusicBrainz</span>
          <a
            :href="lastfmAlbumUrl(album.artist, album.title, lastfmUsername)"
            target="_blank"
            rel="noopener noreferrer"
            class="font-medium text-text-muted transition-colors hover:text-accent"
          >
            Last.fm
          </a>
          <a
            :href="rymSearchUrl(album.artist, album.title)"
            target="_blank"
            rel="noopener noreferrer"
            class="font-medium text-text-muted transition-colors hover:text-accent"
          >
            RYM
          </a>
        </div>
      </div>
    </div>
  </article>
</template>
