import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import {
  buildLastfmAuthUrl,
  callLastfmApi,
  type LastfmServerConfig,
} from './serverApi'

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: LastfmServerConfig,
  subpath: string,
) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    if (subpath === 'auth/token') {
      const data = await callLastfmApi(config, {
        method: 'auth.getToken',
        api_key: config.apiKey,
        format: 'json',
      })
      const token = data.token as string | undefined
      if (!token) throw new Error('Last.fm did not return an auth token')
      sendJson(res, 200, { token, authUrl: buildLastfmAuthUrl(config.apiKey, token) })
      return
    }

    const body = await readJsonBody(req)

    if (subpath === 'auth/session') {
      const token = body.token
      if (typeof token !== 'string' || !token.trim()) {
        sendJson(res, 400, { error: 'Missing token' })
        return
      }

      const data = await callLastfmApi(config, {
        method: 'auth.getSession',
        api_key: config.apiKey,
        token: token.trim(),
        format: 'json',
      })
      const session = data.session as { key?: string; name?: string } | undefined
      if (!session?.key || !session?.name) {
        throw new Error('Last.fm session not ready')
      }

      sendJson(res, 200, { username: session.name, sessionKey: session.key })
      return
    }

    if (subpath === 'auth/disconnect') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (subpath === 'api') {
      const sessionHeader = req.headers['x-lastfm-session']
      const sessionKey =
        (typeof sessionHeader === 'string' ? sessionHeader : undefined) ??
        (typeof body.sessionKey === 'string' ? body.sessionKey : undefined)

      if (!sessionKey) {
        sendJson(res, 401, { error: 'Last.fm not connected' })
        return
      }

      const method = body.method
      if (typeof method !== 'string' || !method.trim()) {
        sendJson(res, 400, { error: 'Missing method' })
        return
      }

      const params: Record<string, string> = {
        method: method.trim(),
        api_key: config.apiKey,
        sk: sessionKey,
        format: 'json',
      }

      for (const [key, value] of Object.entries(body)) {
        if (key === 'method' || key === 'sessionKey' || value === undefined || value === null) {
          continue
        }
        params[key] = String(value)
      }

      const data = await callLastfmApi(config, params)
      sendJson(res, 200, data)
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Last.fm proxy failed'
    sendJson(res, 502, { error: message })
  }
}

export function lastfmDevProxy(apiKey?: string, sharedSecret?: string): Plugin {
  return {
    name: 'lastfm-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/lastfm/')) {
          next()
          return
        }

        if (!apiKey || !sharedSecret) {
          sendJson(res, 503, {
            error: 'LASTFM_API_KEY and LASTFM_SHARED_SECRET must be set in .env',
          })
          return
        }

        const requestUrl = new URL(req.url, 'http://localhost')
        const subpath = requestUrl.pathname.replace(/^\/api\/lastfm\/?/, '')
        await handleRequest(req, res, { apiKey, sharedSecret }, subpath)
      })
    },
  }
}
