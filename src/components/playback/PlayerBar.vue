<script setup lang="ts">
import { computed } from 'vue'

import { formatDuration } from '@/lib/musicbrainz/format'
import { usePlaybackStore } from '@/stores/playback'

const playback = usePlaybackStore()

const progressPercent = computed(() => {
  if (!playback.durationMs) return 0
  return Math.min(100, (playback.positionMs / playback.durationMs) * 100)
})
</script>

<template>
  <footer
    class="fixed inset-x-0 bottom-14 z-40 border-t border-border bg-surface-raised px-4 py-3 md:bottom-0 md:px-8"
    role="region"
    aria-label="Playback"
  >
    <div v-if="playback.error" class="mb-2 text-xs text-amber-200">
      {{ playback.error }}
    </div>

    <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-4">
      <div class="flex min-w-0 items-center gap-3 md:flex-1">
        <div class="min-w-0 flex-1">
          <p v-if="playback.currentItem" class="truncate text-sm font-medium">
            {{ playback.currentItem.title }}
          </p>
          <p v-if="playback.currentItem" class="text-xs text-text-muted">
            {{ playback.currentItem.artist }}
            · {{ playback.currentItem.albumTitle }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1 md:gap-2">
          <button
            type="button"
            class="rounded-lg px-2 py-2 text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text"
            title="Previous"
            @click="playback.previous()"
          >
            ⏮
          </button>
          <button
            type="button"
            class="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted"
            :title="playback.isPlaying ? 'Pause' : 'Play'"
            @click="playback.togglePlayPause()"
          >
            {{ playback.status === 'playing' ? '⏸' : '▶' }}
          </button>
          <button
            type="button"
            class="rounded-lg px-2 py-2 text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text"
            title="Next"
            @click="playback.next()"
          >
            ⏭
          </button>
        </div>
      </div>

      <div class="flex w-full items-center gap-2 md:min-w-[10rem] md:flex-1 md:max-w-xs">
        <span class="shrink-0 text-xs tabular-nums text-text-muted">
          {{ formatDuration(playback.positionMs) }}
        </span>
        <div class="relative h-1.5 min-w-0 flex-1 rounded-full bg-border">
          <div
            class="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width]"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
        <span class="shrink-0 text-xs tabular-nums text-text-muted">
          {{ formatDuration(playback.durationMs || playback.currentItem?.lengthMs) }}
        </span>
        <button
          type="button"
          class="shrink-0 text-xs text-text-muted transition-colors hover:text-text md:ml-2"
          title="Stop playback"
          @click="playback.stop()"
        >
          Stop
        </button>
      </div>
    </div>
  </footer>
</template>
