import { normalizeTrackTitle } from '@/lib/youtube/match'

const EDITION_QUALIFIER =
  /(?:deluxe|standard|expanded|special|remaster|bonus|anniversary|edition|version|explicit|clean|reissue|collector|limited|digital|remix)/i

export function stripEditionQualifiers(title: string): string {
  let trimmed = title.trim()
  let previous = ''

  while (trimmed !== previous) {
    previous = trimmed
    trimmed = trimmed
      .replace(/\s*[\(\[][^)\]]*[\)\]]\s*$/g, (suffix) =>
        EDITION_QUALIFIER.test(suffix) ? '' : suffix,
      )
      .trim()
  }

  return trimmed
}

export function normalizeAlbumTitleForMatch(title: string): string {
  return normalizeTrackTitle(stripEditionQualifiers(title))
}

export function albumTitleMatchKeys(title: string): string[] {
  const keys = new Set<string>()
  const full = normalizeTrackTitle(title)
  const core = normalizeAlbumTitleForMatch(title)

  if (full) keys.add(full)
  if (core) keys.add(core)

  return [...keys]
}
