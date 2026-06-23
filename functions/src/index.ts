import { onRequest } from 'firebase-functions/v2/https'

const DEFAULT_USER_AGENT =
  process.env.MUSICBRAINZ_DEFAULT_USER_AGENT ??
  'Tunicious/2.0 (https://github.com/tunicious)'

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
