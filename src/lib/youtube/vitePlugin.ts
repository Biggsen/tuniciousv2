import type { Plugin, ViteDevServer } from 'vite'

function resolveDevReferer(server: ViteDevServer, override?: string): string {
  if (override?.trim()) return override.trim()

  const { port = 4827, host, https } = server.config.server
  let hostname = host === true || host === undefined ? 'localhost' : String(host)
  if (hostname === '0.0.0.0') hostname = 'localhost'
  const protocol = https ? 'https' : 'http'

  return `${protocol}://${hostname}:${port}/`
}

export function youtubeDevProxy(apiKey: string | undefined, refererOverride?: string): Plugin {
  let resolveReferer: () => string = () => refererOverride?.trim() || 'http://localhost:4827/'

  return {
    name: 'youtube-dev-proxy',
    configureServer(server) {
      resolveReferer = () => resolveDevReferer(server, refererOverride)

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/youtube/')) {
          next()
          return
        }

        if (!apiKey) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'YOUTUBE_API_KEY is not set in .env' }))
          return
        }

        try {
          const requestUrl = new URL(req.url, 'http://localhost')
          const apiPath = requestUrl.pathname.replace(/^\/api\/youtube\/?/, '')
          const params = new URLSearchParams(requestUrl.searchParams)
          params.set('key', apiKey)

          const targetUrl = `https://www.googleapis.com/youtube/v3/${apiPath}?${params.toString()}`
          const upstream = await fetch(targetUrl, {
            headers: {
              Referer: resolveReferer(),
            },
          })
          const body = await upstream.text()

          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(body)
        } catch (error) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'YouTube proxy failed',
            }),
          )
        }
      })
    },
  }
}
