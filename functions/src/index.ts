import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'

import {
  buildAuthUrl,
  callAuthenticatedLastfm,
  getAuthSession,
  getAuthToken,
  type LastfmConfig,
} from './lastfm/api'

initializeApp()

function lastfmConfig(): LastfmConfig {
  const apiKey = process.env.LASTFM_API_KEY
  const sharedSecret = process.env.LASTFM_SHARED_SECRET
  if (!apiKey || !sharedSecret) {
    throw new Error('Last.fm API credentials not configured')
  }
  return { apiKey, sharedSecret }
}

async function verifyIdToken(req: { headers: Record<string, string | string[] | undefined> }) {
  const header = req.headers.authorization
  const value = Array.isArray(header) ? header[0] : header
  if (!value?.startsWith('Bearer ')) {
    throw new Error('Missing authorization')
  }
  const token = value.slice('Bearer '.length)
  return getAuth().verifyIdToken(token)
}

async function readLastfmSession(uid: string): Promise<string | null> {
  const doc = await getFirestore().doc(`users/${uid}`).get()
  const lastfm = doc.data()?.lastfm as { sessionKey?: string } | undefined
  return lastfm?.sessionKey ?? null
}

function sendJson(
  res: { status: (code: number) => { json: (body: unknown) => void } },
  status: number,
  body: unknown,
) {
  res.status(status).json(body)
}

export const lastfmProxy = onRequest({ cors: true }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    const config = lastfmConfig()
    const path = req.path.replace(/^\/api\/lastfm\/?/, '')

    if (path === 'auth/token') {
      const token = await getAuthToken(config)
      sendJson(res, 200, {
        token,
        authUrl: buildAuthUrl(config.apiKey, token),
      })
      return
    }

    const decoded = await verifyIdToken(req)
    const uid = decoded.uid

    if (path === 'auth/session') {
      const token = req.body?.token
      if (typeof token !== 'string' || !token.trim()) {
        sendJson(res, 400, { error: 'Missing token' })
        return
      }

      const session = await getAuthSession(config, token.trim())
      sendJson(res, 200, {
        username: session.username,
        sessionKey: session.sessionKey,
      })
      return
    }

    if (path === 'auth/disconnect') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (path === 'api') {
      const sessionKey = await readLastfmSession(uid)
      if (!sessionKey) {
        sendJson(res, 401, { error: 'Last.fm not connected' })
        return
      }

      const method = req.body?.method
      if (typeof method !== 'string' || !method.trim()) {
        sendJson(res, 400, { error: 'Missing method' })
        return
      }

      const params: Record<string, string> = { method: method.trim() }
      const body = req.body as Record<string, unknown>
      for (const [key, value] of Object.entries(body)) {
        if (key === 'method' || value === undefined || value === null) continue
        params[key] = String(value)
      }

      const data = await callAuthenticatedLastfm(config, sessionKey, params)
      sendJson(res, 200, data)
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Last.fm proxy failed'
    const status = message === 'Missing authorization' ? 401 : 502
    sendJson(res, status, { error: message })
  }
})

const DEFAULT_USER_AGENT =
  process.env.MUSICBRAINZ_DEFAULT_USER_AGENT ??
  'Tunicious/2.0 (https://github.com/Biggsen/tuniciousv2)'

let lastMusicBrainzRequestAt = 0

async function throttleMusicBrainz(): Promise<void> {
  const now = Date.now()
  const wait = Math.max(0, 1000 - (now - lastMusicBrainzRequestAt))
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
  lastMusicBrainzRequestAt = Date.now()
}

export const musicbrainzProxy = onRequest({ cors: true }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    await throttleMusicBrainz()

    const rawPath = req.path.replace(/^\/api\/musicbrainz\/?/, '')
    const queryIndex = req.url.indexOf('?')
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : ''
    const userAgentHeader = req.headers['x-musicbrainz-user-agent']
    const userAgent =
      typeof userAgentHeader === 'string' && userAgentHeader.trim()
        ? userAgentHeader
        : DEFAULT_USER_AGENT

    const targetUrl = `https://musicbrainz.org/ws/2/${rawPath}${query}`

    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
    })

    const body = await upstream.text()
    res.status(upstream.status).set('Content-Type', 'application/json').send(body)
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'MusicBrainz proxy failed',
    })
  }
})

export const youtubeProxy = onRequest({ cors: true }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'YouTube API key not configured' })
    return
  }

  try {
    const rawPath = req.path.replace(/^\/api\/youtube\/?/, '')
    const queryIndex = req.url.indexOf('?')
    const existingQuery = queryIndex >= 0 ? req.url.slice(queryIndex + 1) : ''
    const params = new URLSearchParams(existingQuery)
    params.set('key', apiKey)

    const targetUrl = `https://www.googleapis.com/youtube/v3/${rawPath}?${params.toString()}`

    const upstream = await fetch(targetUrl)
    const body = await upstream.text()
    res.status(upstream.status).set('Content-Type', 'application/json').send(body)
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'YouTube proxy failed',
    })
  }
})
