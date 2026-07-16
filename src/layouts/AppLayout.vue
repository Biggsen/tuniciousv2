<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import PlayerBar from '@/components/playback/PlayerBar.vue'
import YouTubePlayer from '@/components/playback/YouTubePlayer.vue'
import { useAuthStore } from '@/stores/auth'
import { usePlaybackStore } from '@/stores/playback'

const route = useRoute()
const auth = useAuthStore()
const playback = usePlaybackStore()

const navItems = [
  { name: 'home', label: 'Home', to: '/', mobile: true },
  { name: 'explorer', label: 'Explorer', to: '/explorer', mobile: false },
  { name: 'library', label: 'Library', to: '/library', mobile: true },
  { name: 'import', label: 'Import', to: '/import', mobile: false },
  { name: 'migration', label: 'Migration', to: '/migration', mobile: false },
  { name: 'playlists', label: 'Playlists', to: '/playlists', mobile: true },
  { name: 'history', label: 'History', to: '/history', mobile: false },
  { name: 'settings', label: 'Settings', to: '/settings', mobile: true },
]

const mobileNavItems = computed(() => navItems.filter((item) => item.mobile))

const pageTitle = computed(() => {
  const title = route.meta.title
  return typeof title === 'string' ? title : 'Tunicious'
})

const mainPaddingClass = computed(() => {
  if (playback.showPlayerBar) {
    return 'pb-44 md:pb-24'
  }
  return 'max-md:pb-20 md:pb-6'
})

function isActive(name: string) {
  const current = String(route.name ?? '')
  if (name === 'explorer') {
    return current === 'explorer' || current.startsWith('explorer-')
  }
  if (name === 'library') {
    return current === 'library' || current === 'album-detail' || current === 'artist-detail'
  }
  if (name === 'playlists') return current === 'playlists' || current === 'playlist-detail'
  return current === name
}
</script>

<template>
  <div class="flex min-h-screen">
    <aside
      class="hidden w-56 shrink-0 flex-col border-r border-border bg-surface-raised md:flex"
    >
      <div class="border-b border-border px-5 py-6">
        <p class="text-lg font-semibold tracking-tight">Tunicious</p>
        <p class="mt-1 truncate text-xs text-text-muted">
          {{ auth.profile?.displayName ?? auth.user?.email }}
        </p>
      </div>

      <nav class="flex flex-col gap-1 p-3">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          class="rounded-lg px-3 py-2 text-sm transition-colors"
          :class="
            isActive(item.name)
              ? 'bg-accent/15 text-text'
              : 'text-text-muted hover:bg-white/5 hover:text-text'
          "
        >
          {{ item.label }}
        </RouterLink>
        <div class="-mx-3 mt-2 border-t border-border px-3 pt-2">
          <button
            type="button"
            class="w-full rounded-lg px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text"
            @click="auth.signOutUser()"
          >
            Sign out
          </button>
        </div>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex items-center justify-between gap-4 border-b border-border px-4 py-4 md:px-8 md:py-5"
      >
        <div class="min-w-0 md:hidden">
          <p class="text-xs font-medium uppercase tracking-wider text-accent">Tunicious</p>
        </div>
        <h1 class="text-lg font-semibold md:text-xl">{{ pageTitle }}</h1>
        <button
          type="button"
          class="shrink-0 text-sm text-text-muted transition-colors hover:text-text md:hidden"
          @click="auth.signOutUser()"
        >
          Sign out
        </button>
      </header>

      <main class="flex-1 px-4 py-5 md:px-8 md:py-6" :class="mainPaddingClass">
        <RouterView />
      </main>

      <nav
        class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Main navigation"
      >
        <div class="grid grid-cols-5">
          <RouterLink
            v-for="item in mobileNavItems"
            :key="item.name"
            :to="item.to"
            class="flex flex-col items-center gap-0.5 px-1 py-2.5 text-[10px] transition-colors"
            :class="
              isActive(item.name)
                ? 'text-accent'
                : 'text-text-muted hover:text-text'
            "
          >
            <span class="text-base leading-none">{{ item.name === 'home' ? '⌂' : item.name === 'library' ? '♫' : item.name === 'playlists' ? '☰' : item.name === 'settings' ? '⚙' : '·' }}</span>
            <span>{{ item.label }}</span>
          </RouterLink>
        </div>
      </nav>

      <YouTubePlayer />
    </div>
  </div>

  <PlayerBar v-if="playback.showPlayerBar" />
</template>
