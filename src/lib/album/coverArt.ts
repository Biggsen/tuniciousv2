const COVER_ART_ARCHIVE = 'https://coverartarchive.org'

export interface ReleaseCoverUrls {
  small?: string
  large?: string
}

export function pickAlbumCoverSmall(album: {
  coverUrlSmall?: string
  coverUrlLarge?: string
}): string | undefined {
  return album.coverUrlSmall ?? album.coverUrlLarge
}

export function pickAlbumCoverLarge(album: {
  coverUrlSmall?: string
  coverUrlLarge?: string
}): string | undefined {
  return album.coverUrlLarge ?? album.coverUrlSmall
}

export async function fetchReleaseCoverUrls(releaseMbid: string): Promise<ReleaseCoverUrls> {
  try {
    const response = await fetch(`${COVER_ART_ARCHIVE}/release/${releaseMbid}`, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      return {}
    }

    const data = (await response.json()) as {
      images?: { front?: boolean; thumbnails?: { small?: string; large?: string } }[]
    }

    const front = data.images?.find((image) => image.front)
    return {
      small: front?.thumbnails?.small,
      large: front?.thumbnails?.large,
    }
  } catch {
    return {}
  }
}
