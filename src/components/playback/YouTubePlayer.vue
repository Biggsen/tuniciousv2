<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

import { loadYouTubeIframeApi } from '@/lib/youtube/iframeApi'
import type { YouTubePlayerInstance } from '@/lib/youtube/iframeApi'
import { usePlaybackStore } from '@/stores/playback'

const playback = usePlaybackStore()
const hostEl = ref<HTMLElement | null>(null)
const mobileQuery = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mobileQuery.matches)

/** Phone browsers will not play a 48px embed parked under the tab bar. */
const showMobileStage = computed(() => isMobile.value && playback.showPlayerBar)

let player: YouTubePlayerInstance | null = null

function onMobileChange(event: MediaQueryListEvent) {
  isMobile.value = event.matches
}

function fitIframe(iframe: HTMLIFrameElement) {
  iframe.style.width = '100%'
  iframe.style.height = '100%'
  iframe.style.border = '0'
  iframe.style.pointerEvents = 'none'
}

function purgeLeakedPlayers() {
  document.querySelectorAll('[data-tunicious-yt-player="1"]').forEach((node) => {
    if (hostEl.value && (node === hostEl.value || node.contains(hostEl.value))) return
    node.remove()
  })
}

onMounted(async () => {
  mobileQuery.addEventListener('change', onMobileChange)
  purgeLeakedPlayers()
  await nextTick()
  if (!hostEl.value) return

  const yt = await loadYouTubeIframeApi()

  // Non-zero in-viewport size: Chrome often refuses PLAYING on 0×0 / display:none embeds.
  player = new yt.Player(hostEl.value, {
    height: '135',
    width: '240',
    playerVars: {
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      mute: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: (event) => {
        const readyPlayer = event.target
        player = readyPlayer
        try {
          const iframe = readyPlayer.getIframe()
          iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
          fitIframe(iframe)
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
  mobileQuery.removeEventListener('change', onMobileChange)
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
  <!--
    Desktop: a painted speck is enough for Chrome.
    Phone: the speck sits under the tab bar, so iOS/Chrome never reach PLAYING.
    While the bar is up, keep a real 240×135 stage above that chrome.
  -->
  <div
    class="pointer-events-none fixed overflow-hidden"
    :class="
      showMobileStage
        ? 'bottom-[calc(12rem+env(safe-area-inset-bottom))] left-4 z-40 h-[135px] w-60 rounded-lg opacity-100 shadow-lg'
        : 'bottom-0 left-0 z-0 h-12 w-12 opacity-[0.02]'
    "
    aria-hidden="true"
    data-tunicious-yt-player="1"
  >
    <div ref="hostEl" class="h-full w-full" />
  </div>
</template>
