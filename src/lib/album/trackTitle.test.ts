import { describe, expect, it } from 'vitest'

import { replaceTrackTitle } from '@/lib/album/trackTitle'
import type { Track } from '@/types/library'

const tracks: Track[] = [
  { id: 't1', trackNumber: '1', title: 'Genesis' },
  { id: 't2', trackNumber: '2', title: 'Royalty Capes', lengthMs: 226000 },
]

describe('replaceTrackTitle', () => {
  it('updates only the matching track and trims', () => {
    const next = replaceTrackTitle(tracks, 't2', '  Royalty Capes (feat. Little Dragon)  ')
    expect(next[0]).toEqual(tracks[0])
    expect(next[1]).toEqual({
      id: 't2',
      trackNumber: '2',
      title: 'Royalty Capes (feat. Little Dragon)',
      lengthMs: 226000,
    })
  })

  it('returns the same titles when unchanged', () => {
    const next = replaceTrackTitle(tracks, 't1', 'Genesis')
    expect(next[0]?.title).toBe('Genesis')
    expect(next[1]).toEqual(tracks[1])
  })

  it('rejects a blank title', () => {
    expect(() => replaceTrackTitle(tracks, 't1', '   ')).toThrow('Track title is required')
  })

  it('rejects an unknown track id', () => {
    expect(() => replaceTrackTitle(tracks, 'missing', 'Nope')).toThrow('Track not found')
  })
})
