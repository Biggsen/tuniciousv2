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

export async function callLastfmPublicMethod(
  method: string,
  params: Record<string, string | number | undefined>,
): Promise<Record<string, unknown>> {
  const body: Record<string, string | number> = { method }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) body[key] = value
  }

  const response = await fetch('/api/lastfm/public', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  })

  return parseResponse(response)
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

export interface LastfmTrackUserInfo {
  playcount: number
  loved: boolean
}

export function parseUserTrackPlaycount(data: Record<string, unknown>): number {
  const trackData = data.track as { userplaycount?: string | number } | undefined
  const userPlaycount = trackData?.userplaycount
  if (userPlaycount === undefined || userPlaycount === null || userPlaycount === '') {
    return 0
  }
  return Number(userPlaycount)
}

export function parseUserTrackLoved(data: Record<string, unknown>): boolean {
  const trackData = data.track as { userloved?: string | number } | undefined
  return trackData?.userloved === 1 || trackData?.userloved === '1'
}

export function parseLastfmTrackUserInfo(data: Record<string, unknown>): LastfmTrackUserInfo {
  return {
    playcount: parseUserTrackPlaycount(data),
    loved: parseUserTrackLoved(data),
  }
}

type LastfmLovedTrack = {
  name?: string
  artist?: string | { name?: string; '#text'?: string }
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function lovedTrackArtistName(artist: LastfmLovedTrack['artist']): string {
  if (!artist) return ''
  if (typeof artist === 'string') return artist
  return artist.name ?? artist['#text'] ?? ''
}

export function parseLovedTracksPage(data: Record<string, unknown>): {
  tracks: Array<{ artist: string; title: string }>
  page: number
  totalPages: number
} {
  const root = data.lovedtracks as
    | {
        track?: LastfmLovedTrack | LastfmLovedTrack[]
        '@attr'?: { page?: string; totalPages?: string }
      }
    | undefined
  const attr = root?.['@attr']
  const page = Number(attr?.page ?? 1)
  const totalPages = Number(attr?.totalPages ?? 1)

  const tracks = asArray(root?.track)
    .map((track) => ({
      artist: lovedTrackArtistName(track.artist),
      title: track.name ?? '',
    }))
    .filter((track) => track.artist && track.title)

  return {
    tracks,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
  }
}

export async function fetchTrackUserInfo(
  artist: string,
  track: string,
  username: string,
): Promise<LastfmTrackUserInfo> {
  const data = await callLastfmPublicMethod('track.getInfo', {
    artist,
    track,
    username,
    autocorrect: 1,
  })
  return parseLastfmTrackUserInfo(data)
}

export async function fetchTrackPlaycount(
  artist: string,
  track: string,
  username: string,
): Promise<number> {
  return (await fetchTrackUserInfo(artist, track, username)).playcount
}

export async function fetchLovedTracksPage(
  username: string,
  page = 1,
  limit = 50,
): Promise<ReturnType<typeof parseLovedTracksPage>> {
  const data = await callLastfmPublicMethod('user.getLovedTracks', {
    user: username,
    page,
    limit,
  })
  return parseLovedTracksPage(data)
}

export async function loveTrack(
  sessionKey: string | undefined,
  artist: string,
  track: string,
): Promise<void> {
  await callLastfmMethod('track.love', { artist, track }, sessionKey)
}

export async function unloveTrack(
  sessionKey: string | undefined,
  artist: string,
  track: string,
): Promise<void> {
  await callLastfmMethod('track.unlove', { artist, track }, sessionKey)
}
