<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

import { loadYouTubeIframeApi } from '@/lib/youtube/iframeApi'
import type { YouTubePlayerInstance } from '@/lib/youtube/iframeApi'
import { usePlaybackStore } from '@/stores/playback'

const playback = usePlaybackStore()

let player: YouTubePlayerInstance | null = null

onMounted(async () => {
  const yt = await loadYouTubeIframeApi()

  player = new yt.Player('youtube-player-host', {
    height: '0',
    width: '0',
    playerVars: {
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
    },
    events: {
      onReady: () => {
        if (player) {
          playback.registerPlayer(player)
          playback.onPlayerReady()
        }
      },
      onStateChange: (event) => {
        playback.onPlayerStateChange(event.data)
      },
      onError: () => {
        playback.onPlayerError()
      },
    },
  })
})

onUnmounted(() => {
  playback.unregisterPlayer()
  player?.destroy()
  player = null
})
</script>

<template>
  <div
    id="youtube-player-host"
    class="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0"
    aria-hidden="true"
  />
</template>
