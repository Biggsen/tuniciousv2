import { enqueueMusicBrainzRequest } from '@/lib/musicbrainz/throttle'
import { resolveMusicBrainzUserAgent } from '@/lib/musicbrainz/userAgent'

export class MusicBrainzError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'MusicBrainzError'
  }
}

const MAX_ATTEMPTS = 3

function isRetryableMusicBrainzFailure(err: unknown): boolean {
  if (err instanceof MusicBrainzError) {
    return err.status === 500 || err.status === 502 || err.status === 503 || err.status === 504
  }
  if (err instanceof TypeError) return true
  if (err instanceof Error) {
    const message = err.message.toLowerCase()
    return (
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('tls') ||
      message.includes('socket')
    )
  }
  return false
}

/** User-facing copy for MusicBrainz failures (import / explorer). */
export function formatMusicBrainzUserMessage(err: unknown, fallback: string): string {
  if (err instanceof MusicBrainzError) {
    if (err.status === 404) return 'Not found on MusicBrainz.'
    if (err.status === 503 || err.status === 502 || err.status === 504) {
      return 'MusicBrainz is temporarily unavailable. Try again in a moment.'
    }
    if (err.status === 500) {
      return 'MusicBrainz returned an error. Try again in a moment.'
    }
    if (err.status === 429) {
      return 'MusicBrainz rate limit hit. Wait a second and try again.'
    }
    return `MusicBrainz request failed (${err.status}).`
  }
  if (err instanceof Error && err.message) {
    const lower = err.message.toLowerCase()
    if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('tls')) {
      return 'Could not reach MusicBrainz. Check your connection and try again.'
    }
    return err.message
  }
  return fallback
}

async function musicBrainzFetchOnce<T>(
  path: string,
  userAgentOverride?: string,
): Promise<T> {
  const userAgent = resolveMusicBrainzUserAgent(userAgentOverride)
  const url = `/api/musicbrainz/${path.replace(/^\//, '')}`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-MusicBrainz-User-Agent': userAgent,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new MusicBrainzError(
      body || `MusicBrainz request failed (${response.status})`,
      response.status,
    )
  }

  return (await response.json()) as T
}

export async function musicBrainzFetch<T>(
  path: string,
  userAgentOverride?: string,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await enqueueMusicBrainzRequest(() =>
        musicBrainzFetchOnce<T>(path, userAgentOverride),
      )
    } catch (err) {
      lastError = err
      if (!isRetryableMusicBrainzFailure(err) || attempt === MAX_ATTEMPTS) {
        throw err
      }
    }
  }

  throw lastError
}
