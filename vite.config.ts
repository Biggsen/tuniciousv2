import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

import { youtubeDevProxy } from './src/lib/youtube/vitePlugin'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const defaultUserAgent =
    env.VITE_MUSICBRAINZ_DEFAULT_USER_AGENT ||
    env.MUSICBRAINZ_DEFAULT_USER_AGENT ||
    'Tunicious/2.0 (https://github.com/tunicious)'

  return {
    plugins: [
      vue(),
      tailwindcss(),
      youtubeDevProxy(env.YOUTUBE_API_KEY, env.YOUTUBE_API_REFERER),
    ],
    server: {
      port: 4827,
      proxy: {
        '/api/musicbrainz': {
          target: 'https://musicbrainz.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/musicbrainz\/?/, '/ws/2/'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const override = req.headers['x-musicbrainz-user-agent']
              proxyReq.setHeader(
                'User-Agent',
                typeof override === 'string' && override.trim()
                  ? override
                  : defaultUserAgent,
              )
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
