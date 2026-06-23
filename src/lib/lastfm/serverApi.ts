import { createHash } from 'node:crypto'

export function signLastfmParams(
  params: Record<string, string>,
  sharedSecret: string,
): string {
  const sorted = Object.keys(params)
    .filter((key) => key !== 'format' && key !== 'callback')
    .sort()
    .map((key) => key + params[key])
    .join('')
  return createHash('md5').update(sorted + sharedSecret, 'utf8').digest('hex')
}

export function withLastfmSignature(
  params: Record<string, string>,
  sharedSecret: string,
): Record<string, string> {
  return {
    ...params,
    api_sig: signLastfmParams(params, sharedSecret),
  }
}

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/'

export interface LastfmServerConfig {
  apiKey: string
  sharedSecret: string
}

export async function callLastfmApi(
  config: LastfmServerConfig,
  params: Record<string, string>,
  retries = 3,
): Promise<Record<string, unknown>> {
  const signed = withLastfmSignature(params, config.sharedSecret)

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(LASTFM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(signed),
    })

    if (response.status === 502 && attempt < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
      continue
    }

    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok || data.error) {
      throw new Error(
        typeof data.message === 'string' ? data.message : `Last.fm API error (${data.error})`,
      )
    }

    return data
  }

  throw new Error('Last.fm API request failed')
}

export function buildLastfmAuthUrl(apiKey: string, token: string): string {
  return `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`
}
