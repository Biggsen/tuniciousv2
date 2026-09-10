import { describe, expect, it } from 'vitest'

import { compareByFirstReleaseYearAsc, releaseTrackCount } from '@/lib/musicbrainz/format'

describe('compareByFirstReleaseYearAsc', () => {
  it('orders by year ascending and puts undated last', () => {
    const items = [
      { id: 'c', 'first-release-date': '2016-01-01' },
      { id: 'a', 'first-release-date': '2006' },
      { id: 'd' },
      { id: 'b', 'first-release-date': '2009-05-01' },
    ]

    const sorted = [...items].sort(compareByFirstReleaseYearAsc).map((item) => item.id)
    expect(sorted).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('releaseTrackCount', () => {
  it('sums track-count across media', () => {
    expect(
      releaseTrackCount({
        media: [{ 'track-count': 13 }, { 'track-count': 6 }],
      }),
    ).toBe(19)
  })

  it('falls back to tracks array length', () => {
    expect(
      releaseTrackCount({
        media: [{ tracks: [{}, {}, {}] }],
      }),
    ).toBe(3)
  })

  it('returns undefined when media is missing', () => {
    expect(releaseTrackCount({})).toBeUndefined()
  })
})
