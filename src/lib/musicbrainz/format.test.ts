import { describe, expect, it } from 'vitest'

import { compareByFirstReleaseYearAsc } from '@/lib/musicbrainz/format'

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
