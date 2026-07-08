<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { pickAlbumCoverSmall } from '@/lib/album/coverArt'
import { lastfmAlbumUrl, rymSearchUrl } from '@/lib/playlist/externalLinks'
import { countAlbumResolvedTracks } from '@/lib/youtube/albumResolve'
import type { PlaylistMember } from '@/types/library'
import type { TrackPlayStats } from '@/types/sessions'
import type { TrackYouTubeMapping } from '@/types/youtube'

const props = defineProps<{
  member: PlaylistMember
  playlistId: string
  mappings: Map<string, TrackYouTubeMapping>
  playStats: Map<string, TrackPlayStats>
  showTracklist: boolean
  canMoveUp: boolean
  canMoveDown: boolean
}>()

const emit = defineEmits<{
  remove: []
  moveUp: []
  moveDown: []
}>()

const menuOpen = ref(false)

const album = computed(() => props.member.album)

const resolveStats = computed(() =>
  countAlbumResolvedTracks(album.value, props.mappings),
)

const resolvedPercent = computed(() => {
  if (resolveStats.value.total === 0) return 0
  return Math.round((resolveStats.value.resolved / resolveStats.value.total) * 100)
})

function trackPlaycount(trackId: string): number {
  return props.playStats.get(trackId)?.playcount ?? 0
}

function isTrackResolved(trackId: string): boolean {
  return props.mappings.has(trackId)
}

function closeMenu() {
  menuOpen.value = false
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
            <span
              class="shrink-0 text-xs"
              :class="isTrackResolved(track.id) ? 'text-red-400' : 'text-text-muted/40'"
              :title="isTrackResolved(track.id) ? 'Resolved' : 'Unresolved'"
            >
              {{ isTrackResolved(track.id) ? '♥' : '♡' }}
            </span>
          </li>
        </ul>
      </div>

      <div class="mt-auto">
        <div class="mb-1 flex items-center justify-between text-xs text-text-muted">
          <span>Resolved tracks</span>
          <span>{{ resolvedPercent }}%</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-emerald-500/80 transition-all"
            :style="{ width: `${resolvedPercent}%` }"
          />
        </div>

        <div
          class="mt-3 flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-xs"
        >
          <RouterLink
            :to="{ name: 'explorer-release', params: { mbid: album.releaseMbid } }"
            class="font-medium text-text-muted transition-colors hover:text-accent"
          >
            MusicBrainz
          </RouterLink>
          <a
            :href="lastfmAlbumUrl(album.artist, album.title)"
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
