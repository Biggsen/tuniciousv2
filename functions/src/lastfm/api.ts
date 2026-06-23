import { withLastfmSignature } from './sign'

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/'

export interface LastfmConfig {
  apiKey: string
  sharedSecret: string
}

export async function callLastfmApi(
  config: LastfmConfig,
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

export async function getAuthToken(config: LastfmConfig): Promise<string> {
  const data = await callLastfmApi(config, {
    method: 'auth.getToken',
    api_key: config.apiKey,
    format: 'json',
  })
  const token = data.token as string | undefined
  if (!token) throw new Error('Last.fm did not return an auth token')
  return token
}

export async function getAuthSession(
  config: LastfmConfig,
  token: string,
): Promise<{ sessionKey: string; username: string }> {
  const data = await callLastfmApi(config, {
    method: 'auth.getSession',
    api_key: config.apiKey,
    token,
    format: 'json',
  })
  const session = data.session as { key?: string; name?: string } | undefined
  if (!session?.key || !session?.name) {
    throw new Error('Last.fm session not ready')
  }
  return { sessionKey: session.key, username: session.name }
}

export function buildAuthUrl(apiKey: string, token: string): string {
  return `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`
}

export async function callAuthenticatedLastfm(
  config: LastfmConfig,
  sessionKey: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  return callLastfmApi(config, {
    ...params,
    api_key: config.apiKey,
    sk: sessionKey,
    format: 'json',
  })
}
