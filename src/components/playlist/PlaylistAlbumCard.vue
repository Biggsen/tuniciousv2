<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import TrackLovedHeart from '@/components/lastfm/TrackLovedHeart.vue'
import { pickAlbumCoverSmall } from '@/lib/album/coverArt'
import { setTrackLoved } from '@/lib/lastfm/scrobble'
import { lastfmAlbumUrl, rymSearchUrl } from '@/lib/playlist/externalLinks'
import { countAlbumResolvedTracks } from '@/lib/youtube/albumResolve'
import { useAuthStore } from '@/stores/auth'
import type { PlaylistMember, Track } from '@/types/library'
import type { WorkflowAction } from '@/types/pipeline'
import type { TrackPlayStats } from '@/types/sessions'
import type { TrackYouTubeMapping } from '@/types/youtube'

const auth = useAuthStore()

const props = defineProps<{
  member: PlaylistMember
  playlistId: string
  mappings: Map<string, TrackYouTubeMapping>
  playStats: Map<string, TrackPlayStats>
  showTracklist: boolean
  showResolveStats?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  workflowActions?: WorkflowAction[]
  canUndoWorkflow?: boolean
  workflowBlockedReason?: string
  resolvingFromPlaylist?: boolean
  resolveFromPlaylistProgress?: string
  resolveFromPlaylistMessage?: string | null
  resolveFromPlaylistDisabled?: boolean
}>()

const emit = defineEmits<{
  remove: []
  moveUp: []
  moveDown: []
  workflowAction: [action: WorkflowAction]
  undoWorkflow: []
  resolveFromPlaylist: []
  lovedChange: [trackId: string, loved: boolean]
}>()

const menuOpen = ref(false)

const album = computed(() => props.member.album)

const lastfmUsername = computed(() => auth.profile?.lastfm?.username)
const lastfmConnected = computed(() => Boolean(auth.profile?.lastfm?.sessionKey))
const togglingLovedIds = ref<Set<string>>(new Set())
const lovedToggleError = ref<string | null>(null)

const resolveStats = computed(() =>
  countAlbumResolvedTracks(album.value, props.mappings),
)

const resolvedPercent = computed(() => {
  if (resolveStats.value.total === 0) return 0
  return Math.round((resolveStats.value.resolved / resolveStats.value.total) * 100)
})

const resolveFromPlaylistLabel = computed(() => {
  if (props.resolvingFromPlaylist) {
    const progress = props.resolveFromPlaylistProgress?.trim()
    return progress ? `Resolving… ${progress}` : 'Resolving…'
  }
  return album.value.youtubePlaylistId
    ? 'Resolve from playlist'
    : 'Resolve via Topic channel'
})

function trackPlaycount(trackId: string): number {
  return props.playStats.get(trackId)?.playcount ?? 0
}

function isTrackLoved(trackId: string): boolean {
  return props.playStats.get(trackId)?.loved === true
}

function isTogglingLoved(trackId: string): boolean {
  return togglingLovedIds.value.has(trackId)
}

async function handleToggleLoved(track: Track) {
  if (!auth.user || !lastfmConnected.value) return

  const nextLoved = !isTrackLoved(track.id)
  lovedToggleError.value = null
  togglingLovedIds.value = new Set(togglingLovedIds.value).add(track.id)
  emit('lovedChange', track.id, nextLoved)

  try {
    await setTrackLoved(auth.user.uid, album.value, track, nextLoved)
  } catch (err) {
    emit('lovedChange', track.id, !nextLoved)
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

function actionLabel(action: WorkflowAction): string {
  if (action === 'start') return 'Start'
  if (action === 'yes') return 'Yes'
  return 'No'
}
</script>

<template>
  <article class="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface-raised/50">
    <RouterLink
      :to="{
        name: 'album-detail',
        params: { id: album.id },
        query: { playlistId },
      }"
      class="group block"
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
        <ul class="space-y-1 text-sm">
          <li
            v-for="track in album.tracks"
            :key="track.id"
            class="flex items-center gap-2"
          >
            <span class="min-w-0 flex-1 truncate">{{ track.title }}</span>
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
        <div
          v-if="workflowActions?.length || canUndoWorkflow || workflowBlockedReason"
          class="mb-3 rounded-lg border border-border bg-surface px-3 py-2"
        >
          <p class="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">Workflow</p>
          <p v-if="workflowBlockedReason" class="mb-2 text-xs text-amber-300">
            {{ workflowBlockedReason }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="action in workflowActions"
              :key="action"
              type="button"
              class="rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-white/5"
              @click="emit('workflowAction', action)"
            >
              {{ actionLabel(action) }}
            </button>
            <button
              v-if="canUndoWorkflow"
              type="button"
              class="rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-white/5"
              @click="emit('undoWorkflow')"
            >
              Undo
            </button>
          </div>
        </div>

        <div
          v-if="showResolveStats !== false"
          class="mb-1 flex items-center justify-between text-xs"
          :class="resolvedPercent === 100 ? 'text-emerald-400' : 'text-amber-400'"
        >
          <span>Resolved</span>
          <span>{{ resolveStats.resolved }}/{{ resolveStats.total }} · {{ resolvedPercent }}%</span>
        </div>
        <div
          v-if="showResolveStats !== false"
          class="h-1.5 overflow-hidden rounded-full bg-white/10"
        >
          <div
            class="h-full rounded-full transition-all"
            :class="resolvedPercent === 100 ? 'bg-emerald-500/80' : 'bg-amber-500/80'"
            :style="{ width: `${resolvedPercent}%` }"
          />
        </div>
        <p v-else class="text-xs text-text-muted">
          {{ album.tracks.length }} track{{ album.tracks.length === 1 ? '' : 's' }}
        </p>

        <button
          type="button"
          class="mt-2 w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="resolvingFromPlaylist || resolveFromPlaylistDisabled"
          @click="emit('resolveFromPlaylist')"
        >
          {{ resolveFromPlaylistLabel }}
        </button>
        <p
          v-if="resolveFromPlaylistMessage"
          class="mt-1 text-xs text-emerald-300"
        >
          {{ resolveFromPlaylistMessage }}
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
