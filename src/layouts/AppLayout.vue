<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

const navItems = [
  { name: 'home', label: 'Home', to: '/' },
  { name: 'explorer', label: 'Explorer', to: '/explorer' },
  { name: 'library', label: 'Library', to: '/library' },
  { name: 'artists', label: 'Artists', to: '/artists' },
  { name: 'playlists', label: 'Playlists', to: '/playlists' },
  { name: 'history', label: 'History', to: '/history' },
  { name: 'settings', label: 'Settings', to: '/settings' },
]

const pageTitle = computed(() => {
  const title = route.meta.title
  return typeof title === 'string' ? title : 'Tunicious'
})

function isActive(name: string) {
  const current = String(route.name ?? '')
  if (name === 'explorer') {
    return current === 'explorer' || current.startsWith('explorer-')
  }
  if (name === 'library') return current === 'library' || current === 'album-detail'
  if (name === 'artists') return current === 'artists' || current === 'artist-detail'
  if (name === 'playlists') return current === 'playlists' || current === 'playlist-detail'
  return current === name
}
</script>

<template>
  <div class="flex min-h-screen">
    <aside class="flex w-56 shrink-0 flex-col border-r border-border bg-surface-raised">
      <div class="border-b border-border px-5 py-6">
        <p class="text-lg font-semibold tracking-tight">Tunicious</p>
        <p class="mt-1 truncate text-xs text-text-muted">
          {{ auth.profile?.displayName ?? auth.user?.email }}
        </p>
      </div>

      <nav class="flex flex-1 flex-col gap-1 p-3">
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
      </nav>

      <div class="border-t border-border p-3">
        <button
          type="button"
          class="w-full rounded-lg px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-white/5 hover:text-text"
          @click="auth.signOutUser()"
        >
          Sign out
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="border-b border-border px-8 py-5">
        <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
      </header>

      <main class="flex-1 px-8 py-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
