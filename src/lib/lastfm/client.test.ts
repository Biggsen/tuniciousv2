import { describe, expect, it } from 'vitest'

import { parseUserTrackPlaycount } from '@/lib/lastfm/client'

describe('parseUserTrackPlaycount', () => {
  it('reads userplaycount from track.getInfo response', () => {
    expect(parseUserTrackPlaycount({ track: { userplaycount: '12' } })).toBe(12)
  })

  it('returns 0 when userplaycount is missing', () => {
    expect(parseUserTrackPlaycount({ track: { playcount: '99983' } })).toBe(0)
  })
})
