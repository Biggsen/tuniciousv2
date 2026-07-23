<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

import { loadYouTubeIframeApi } from '@/lib/youtube/iframeApi'
import type { YouTubePlayerInstance } from '@/lib/youtube/iframeApi'
import { usePlaybackStore } from '@/stores/playback'

const playback = usePlaybackStore()
const hostEl = ref<HTMLElement | null>(null)

let player: YouTubePlayerInstance | null = null

function purgeLeakedPlayers() {
  document.querySelectorAll('[data-tunicious-yt-player="1"]').forEach((node) => {
    if (hostEl.value && (node === hostEl.value || node.contains(hostEl.value))) return
    node.remove()
  })
}

onMounted(async () => {
  purgeLeakedPlayers()
  await nextTick()
  if (!hostEl.value) return

  const yt = await loadYouTubeIframeApi()

  player = new yt.Player(hostEl.value, {
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
      onReady: (event) => {
        const readyPlayer = event.target
        player = readyPlayer
        try {
          const iframe = readyPlayer.getIframe()
          iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
          iframe.setAttribute(
            'allow',
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
          )
          iframe.dataset.tuniciousYtPlayer = '1'
        } catch {
          /* ignore */
        }
        playback.registerPlayer(readyPlayer)
        playback.onPlayerReady()
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
  try {
    player?.destroy()
  } catch {
    /* ignore */
  }
  player = null
  document.querySelectorAll('[data-tunicious-yt-player="1"]').forEach((node) => node.remove())
})
</script>

<template>
  <div
    class="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0"
    aria-hidden="true"
    data-tunicious-yt-player="1"
  >
    <div ref="hostEl" />
  </div>
</template>
