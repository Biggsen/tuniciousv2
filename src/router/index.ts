import { createRouter, createWebHistory } from 'vue-router'

import AppLayout from '@/layouts/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/lastfm/callback',
      name: 'lastfm-callback',
      component: () => import('@/views/LastfmCallbackView.vue'),
      meta: { public: true, hiddenNav: true },
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/HomeView.vue'),
          meta: { title: 'Home' },
        },
        {
          path: 'explorer',
          name: 'explorer',
          component: () => import('@/views/ExplorerView.vue'),
          meta: { title: 'Explorer' },
        },
        {
          path: 'library',
          name: 'library',
          component: () => import('@/views/LibraryView.vue'),
          meta: { title: 'Library' },
        },
        {
          path: 'library/:id',
          name: 'album-detail',
          component: () => import('@/views/AlbumDetailView.vue'),
          meta: { title: 'Album' },
        },
        {
          path: 'artists',
          name: 'artists',
          component: () => import('@/views/ArtistsView.vue'),
          meta: { title: 'Artists' },
        },
        {
          path: 'artists/:id',
          name: 'artist-detail',
          component: () => import('@/views/ArtistDetailView.vue'),
          meta: { title: 'Artist' },
        },
        {
          path: 'playlists',
          name: 'playlists',
          component: () => import('@/views/PlaylistsView.vue'),
          meta: { title: 'Playlists' },
        },
        {
          path: 'playlists/:id',
          name: 'playlist-detail',
          component: () => import('@/views/PlaylistDetailView.vue'),
          meta: { title: 'Playlist' },
        },
        {
          path: 'history',
          name: 'history',
          component: () => import('@/views/HistoryView.vue'),
          meta: { title: 'History' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { title: 'Settings' },
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.ready) {
    await new Promise<void>((resolve) => {
      const interval = window.setInterval(() => {
        if (auth.ready) {
          window.clearInterval(interval)
          resolve()
        }
      }, 50)
    })
  }

  if (to.meta.public) {
    if (to.name === 'login' && auth.user) {
      return { name: 'home' }
    }
    return true
  }

  if (!auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  return true
})

export default router
