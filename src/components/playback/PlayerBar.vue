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
    class="border-t border-border bg-surface-raised px-6 py-3"
    role="region"
    aria-label="Playback"
  >
    <div v-if="playback.error" class="mb-2 text-xs text-amber-200">
      {{ playback.error }}
    </div>

    <div class="flex flex-wrap items-center gap-4">
      <div class="min-w-0 flex-1">
        <p v-if="playback.currentItem" class="truncate text-sm font-medium">
          {{ playback.currentItem.title }}
        </p>
        <p v-if="playback.currentItem" class="truncate text-xs text-text-muted">
          {{ playback.currentItem.artist }}
          · {{ playback.currentItem.albumTitle }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg px-2.5 py-2 text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text"
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
          class="rounded-lg px-2.5 py-2 text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text"
          title="Next"
          @click="playback.next()"
        >
          ⏭
        </button>
      </div>

      <div class="flex min-w-[10rem] flex-1 items-center gap-2 sm:max-w-xs">
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
      </div>

      <button
        type="button"
        class="text-xs text-text-muted transition-colors hover:text-text"
        title="Stop playback"
        @click="playback.stop()"
      >
        Stop
      </button>
    </div>
  </footer>
</template>
