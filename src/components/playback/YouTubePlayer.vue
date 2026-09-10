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

  // Non-zero in-viewport size: Chrome often refuses PLAYING on 0×0 / display:none embeds.
  player = new yt.Player(hostEl.value, {
    height: '48',
    width: '48',
    playerVars: {
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      mute: 1,
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
      onError: (event) => {
        playback.onPlayerError(event.data)
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
  <!-- Keep a real painted box in the viewport so Chrome will allow media playback. -->
  <div
    class="pointer-events-none fixed bottom-0 left-0 z-0 h-12 w-12 overflow-hidden opacity-[0.02]"
    aria-hidden="true"
    data-tunicious-yt-player="1"
  >
    <div ref="hostEl" class="h-full w-full" />
  </div>
</template>
