import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchItunesAlbumCoverUrls,
  itunesArtworkUrl,
  pickItunesAlbumCover,
  coverUrlsFromManualUrl,
  resolveAlbumCoverUrls,
} from '@/lib/album/coverArt'

const ARTWORK_100 =
  'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/cover/source/100x100bb.jpg'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

describe('itunesArtworkUrl', () => {
  it('rewrites 100x100bb to the requested square size', () => {
    expect(itunesArtworkUrl(ARTWORK_100, 1200)).toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/cover/source/1200x1200bb.jpg',
    )
  })
})

describe('coverUrlsFromManualUrl', () => {
  it('stores the same https url as small and large', () => {
    expect(coverUrlsFromManualUrl('  https://example.com/mixmonk.jpg  ')).toEqual({
      small: 'https://example.com/mixmonk.jpg',
      large: 'https://example.com/mixmonk.jpg',
    })
  })

  it('rejects a non-http url', () => {
    expect(() => coverUrlsFromManualUrl('javascript:alert(1)')).toThrow(
      'URL must start with http or https',
    )
  })
})

describe('pickItunesAlbumCover', () => {
  it('maps a matching album to small and large artwork urls', () => {
    expect(
      pickItunesAlbumCover(
        [
          {
            artistName: 'Wrong Band',
            collectionName: 'and the Anonymous Nobody...',
            artworkUrl100: 'https://example.com/wrong/100x100bb.jpg',
          },
          {
            artistName: 'De La Soul',
            collectionName: 'and the Anonymous Nobody...',
            artworkUrl100: ARTWORK_100,
          },
        ],
        'De La Soul',
        'And the Anonymous Nobody',
      ),
    ).toEqual({
      small: itunesArtworkUrl(ARTWORK_100, 400),
      large: itunesArtworkUrl(ARTWORK_100, 1200),
    })
  })

  it('matches a collab credit against a longer iTunes artist name', () => {
    expect(
      pickItunesAlbumCover(
        [
          {
            artistName: 'Joey Baron, Bram de Looze & Robin Verheyen',
            collectionName: 'MIXMONK',
            artworkUrl100: ARTWORK_100,
          },
        ],
        'Baron / De Looze / Verheyen',
        'MIXMONK',
      ),
    ).toEqual({
      small: itunesArtworkUrl(ARTWORK_100, 400),
      large: itunesArtworkUrl(ARTWORK_100, 1200),
    })
  })

  it('does not accept a sequel with a longer title', () => {
    expect(
      pickItunesAlbumCover(
        [
          {
            artistName: 'Joey Baron, Bram de Looze & Robin Verheyen',
            collectionName: 'Mixmonk - On the Loose',
            artworkUrl100: ARTWORK_100,
          },
        ],
        'Baron / De Looze / Verheyen',
        'MIXMONK',
      ),
    ).toEqual({})
  })

  it('returns empty when no result matches artist and title', () => {
    expect(
      pickItunesAlbumCover(
        [
          {
            artistName: 'Someone Else',
            collectionName: 'Totally Different',
            artworkUrl100: ARTWORK_100,
          },
        ],
        'De La Soul',
        'And the Anonymous Nobody',
      ),
    ).toEqual({})
  })
})

describe('resolveAlbumCoverUrls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses Cover Art Archive when front thumbnails exist', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        images: [
          {
            front: true,
            thumbnails: {
              small: 'https://coverartarchive.org/small.jpg',
              large: 'https://coverartarchive.org/large.jpg',
            },
          },
        ],
      }),
    )

    const covers = await resolveAlbumCoverUrls({
      releaseMbid: 'mbid-1',
      artist: 'De La Soul',
      title: 'And the Anonymous Nobody',
    })

    expect(covers).toEqual({
      small: 'https://coverartarchive.org/small.jpg',
      large: 'https://coverartarchive.org/large.jpg',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to iTunes when CAA has no art', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ images: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              artistName: 'De La Soul',
              collectionName: 'and the Anonymous Nobody...',
              artworkUrl100: ARTWORK_100,
            },
          ],
        }),
      )

    const covers = await resolveAlbumCoverUrls({
      releaseMbid: 'mbid-1',
      artist: 'De La Soul',
      title: 'And the Anonymous Nobody',
    })

    expect(covers.small).toBe(itunesArtworkUrl(ARTWORK_100, 400))
    expect(covers.large).toBe(itunesArtworkUrl(ARTWORK_100, 1200))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('stays empty when neither source matches', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValue(
        jsonResponse({
          results: [
            {
              artistName: 'Unrelated',
              collectionName: 'Nope',
              artworkUrl100: ARTWORK_100,
            },
          ],
        }),
      )

    await expect(
      resolveAlbumCoverUrls({
        releaseMbid: 'mbid-1',
        artist: 'De La Soul',
        title: 'And the Anonymous Nobody',
      }),
    ).resolves.toEqual({})
  })
})

describe('fetchItunesAlbumCoverUrls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns empty without calling search when the query is blank', async () => {
    await expect(fetchItunesAlbumCoverUrls('', '')).resolves.toEqual({})
    expect(fetch).not.toHaveBeenCalled()
  })
})
