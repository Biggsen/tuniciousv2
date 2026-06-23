import {
  disconnectLastfmApi,
  exchangeAuthToken,
  fetchAuthToken,
} from '@/lib/lastfm/client'
import { clearLastfmConnection, saveLastfmConnection } from '@/lib/lastfm/firestore'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 120_000

function waitForCallback(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('Last.fm authorization timed out'))
    }, POLL_TIMEOUT_MS)

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'lastfm-auth-callback') return
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve()
    }

    window.addEventListener('message', onMessage)
  })
}

function openAuthPopup(authUrl: string): Window | null {
  return window.open(authUrl, 'lastfm-auth', 'width=600,height=700')
}

let pendingAuthToken: string | null = null

export function getPendingLastfmAuthToken(): string | null {
  return pendingAuthToken
}

function isRetryableAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return true
  const message = error.message.toLowerCase()
  return (
    message.includes('not been authorized') ||
    message.includes('session not ready') ||
    message.includes('authorization timed out')
  )
}

export async function completeLastfmConnect(
  uid: string,
  token: string,
): Promise<{ username: string }> {
  const session = await exchangeAuthToken(token)
  await saveLastfmConnection(uid, session)
  return { username: session.username }
}

export async function connectLastfm(uid: string): Promise<{ username: string }> {
  const { token, authUrl } = await fetchAuthToken()
  pendingAuthToken = token
  const popup = openAuthPopup(authUrl)

  const callbackPromise = waitForCallback().catch(() => undefined)
  let lastError: Error | null = null
  const startedAt = Date.now()

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    try {
      const result = await completeLastfmConnect(uid, token)
      pendingAuthToken = null
      popup?.close()
      return result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Last.fm auth failed')
      if (!isRetryableAuthError(error)) {
        popup?.close()
        throw lastError
      }
      await Promise.race([
        callbackPromise,
        new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS)),
      ])
    }
  }

  popup?.close()
  throw lastError ?? new Error('Last.fm authorization was not completed')
}

export async function disconnectLastfm(uid: string): Promise<void> {
  try {
    await disconnectLastfmApi()
  } catch {
    // Local disconnect still proceeds if proxy is unavailable.
  }
  await clearLastfmConnection(uid)
}
