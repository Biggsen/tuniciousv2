const FALLBACK_USER_AGENT = 'Tunicious/2.0 (https://github.com/tunicious)'

export function getDefaultMusicBrainzUserAgent(): string {
  return import.meta.env.VITE_MUSICBRAINZ_DEFAULT_USER_AGENT || FALLBACK_USER_AGENT
}

export function resolveMusicBrainzUserAgent(override: string | undefined): string {
  const trimmed = override?.trim()
  return trimmed || getDefaultMusicBrainzUserAgent()
}
