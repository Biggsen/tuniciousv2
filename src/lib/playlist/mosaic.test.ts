import { describe, expect, it } from 'vitest'

import { playlistMosaicCoverUrls } from '@/lib/playlist/mosaic'

describe('playlistMosaicCoverUrls', () => {
  it('takes the first four albums in order when there are at least four', () => {
    expect(
      playlistMosaicCoverUrls([
        { coverUrlSmall: 'https://a.jpg' },
        {},
        { coverUrlLarge: 'https://c.jpg' },
        { coverUrlSmall: 'https://d.jpg' },
        { coverUrlSmall: 'https://e.jpg' },
      ]),
    ).toEqual(['https://a.jpg', '', 'https://c.jpg', 'https://d.jpg'])
  })

  it('uses only the first album cover when there are fewer than four albums', () => {
    expect(
      playlistMosaicCoverUrls([
        { coverUrlSmall: 'https://a.jpg' },
        { coverUrlSmall: 'https://b.jpg' },
        { coverUrlSmall: 'https://c.jpg' },
      ]),
    ).toEqual(['https://a.jpg'])
  })
})
