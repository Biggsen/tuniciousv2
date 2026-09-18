import { describe, expect, it } from 'vitest'

import { mergePlayStats, mergeHydratedPlayStats, nextPlaycountFromLastfm } from '@/lib/sessions/playStats'

describe('nextPlaycountFromLastfm', () => {
  it('lets Last.fm replace the local count on refresh', () => {
    expect(nextPlaycountFromLastfm(12, 4, 'authoritative')).toBe(4)
  })

  it('keeps a local increment when Last.fm is still catching up', () => {
    expect(nextPlaycountFromLastfm(5, 4, 'floor')).toBe(5)
  })

  it('takes Last.fm when it is ahead of the local cache', () => {
    expect(nextPlaycountFromLastfm(2, 9, 'floor')).toBe(9)
  })
})

describe('mergeHydratedPlayStats', () => {
  it('does not let a stale fetch clobber a local increment', () => {
    const merged = mergeHydratedPlayStats(
      { trackId: 't1', playcount: 13 },
      { trackId: 't1', playcount: 12, loved: true },
    )
    expect(merged.playcount).toBe(13)
    expect(merged.loved).toBe(true)
  })
})

describe('mergePlayStats', () => {
  it('can clear loved without dropping playcount', () => {
    const merged = mergePlayStats(
      { trackId: 't1', playcount: 3, loved: true },
      { trackId: 't1', loved: false },
    )
    expect(merged.playcount).toBe(3)
    expect(merged.loved).toBe(false)
  })
})
