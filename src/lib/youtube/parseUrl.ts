export function parseVideoIdFromInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0]
      return id && id.length === 11 ? id : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const fromQuery = url.searchParams.get('v')
      if (fromQuery && fromQuery.length === 11) return fromQuery

      const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/)
      if (embedMatch) return embedMatch[1]
    }
  } catch {
    return null
  }

  return null
}

export function parsePlaylistIdFromInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^PL[a-zA-Z0-9_-]+$/.test(trimmed) || /^OLAK5uy_[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const list = url.searchParams.get('list')
      if (list) return list
    }
  } catch {
    return null
  }

  return null
}
