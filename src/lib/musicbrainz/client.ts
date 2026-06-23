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

export async function musicBrainzFetch<T>(
  path: string,
  userAgentOverride?: string,
): Promise<T> {
  return enqueueMusicBrainzRequest(async () => {
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
  })
}
