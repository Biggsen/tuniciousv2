const COVER_ART_ARCHIVE = 'https://coverartarchive.org'

export async function fetchReleaseCoverUrl(releaseMbid: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${COVER_ART_ARCHIVE}/release/${releaseMbid}`, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      return undefined
    }

    const data = (await response.json()) as {
      images?: { front?: boolean; thumbnails?: { small?: string; large?: string } }[]
    }

    const front = data.images?.find((image) => image.front)
    return front?.thumbnails?.large ?? front?.thumbnails?.small
  } catch {
    return undefined
  }
}
