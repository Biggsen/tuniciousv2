import { getFirebaseAuth } from '@/lib/firebase'

export class LastfmClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LastfmClientError'
  }
}

async function authHeaders(sessionKey?: string): Promise<HeadersInit> {
  const user = getFirebaseAuth().currentUser
  if (!user) {
    throw new LastfmClientError('Sign in required')
  }

  const token = await user.getIdToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  if (import.meta.env.DEV && sessionKey) {
    headers['X-Lastfm-Session'] = sessionKey
  }

  return headers
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string | number; message?: string }
  if (!response.ok) {
    const message =
      typeof data.message === 'string'
        ? data.message
        : typeof data.error === 'string'
          ? data.error
          : `Last.fm request failed (${response.status})`
    throw new LastfmClientError(message)
  }
  return data
}

export async function fetchAuthToken(): Promise<{ token: string; authUrl: string }> {
  const response = await fetch('/api/lastfm/auth/token', { method: 'POST' })
  return parseResponse(response)
}

export async function exchangeAuthToken(
  token: string,
): Promise<{ username: string; sessionKey: string }> {
  const response = await fetch('/api/lastfm/auth/session', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ token }),
  })
  return parseResponse(response)
}

export async function disconnectLastfmApi(): Promise<void> {
  const response = await fetch('/api/lastfm/auth/disconnect', {
    method: 'POST',
    headers: await authHeaders(),
  })
  await parseResponse(response)
}

export async function callLastfmMethod(
  method: string,
  params: Record<string, string | number | undefined>,
  sessionKey?: string,
): Promise<Record<string, unknown>> {
  const body: Record<string, string | number> = { method }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) body[key] = value
  }

  const response = await fetch('/api/lastfm/api', {
    method: 'POST',
    headers: await authHeaders(sessionKey),
    body: JSON.stringify(body),
  })

  return parseResponse(response)
}

export async function updateNowPlaying(
  sessionKey: string | undefined,
  artist: string,
  track: string,
  album?: string,
  durationMs?: number,
): Promise<void> {
  await callLastfmMethod(
    'track.updateNowPlaying',
    {
      artist,
      track,
      album,
      duration: durationMs ? Math.round(durationMs / 1000) : undefined,
    },
    sessionKey,
  )
}

export async function scrobbleTrack(
  sessionKey: string | undefined,
  artist: string,
  track: string,
  timestamp: number,
  album?: string,
  durationMs?: number,
): Promise<void> {
  await callLastfmMethod(
    'track.scrobble',
    {
      artist,
      track,
      album,
      timestamp,
      duration: durationMs ? Math.round(durationMs / 1000) : undefined,
    },
    sessionKey,
  )
}

export async function fetchTrackPlaycount(
  sessionKey: string | undefined,
  artist: string,
  track: string,
): Promise<number> {
  const data = await callLastfmMethod(
    'track.getInfo',
    { artist, track },
    sessionKey,
  )
  const playcount = (data.track as { playcount?: string | number } | undefined)?.playcount
  return Number(playcount ?? 0)
}
