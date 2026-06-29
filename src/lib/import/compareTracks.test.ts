import { describe, expect, it } from 'vitest'

import {
  compareTracklists,
  isTracklistFullyAlignedByPosition,
  tracklistMatchPercent,
} from '@/lib/import/compareTracks'
import type { StagedTrack } from '@/lib/import/types'
import type { MbTrack } from '@/lib/musicbrainz/types'

function csvTrack(title: string, trackNumber: number): StagedTrack {
  return {
    trackUri: `spotify:track:${trackNumber}`,
    trackName: title,
    artistName: 'Artist',
    discNumber: 1,
    trackNumber,
  }
}

function mbTrack(title: string): MbTrack {
  return { id: title, title, length: 180000 }
}

describe('isTracklistFullyAlignedByPosition', () => {
  it('returns true when every position aligns', () => {
    const rows = compareTracklists(
      [csvTrack('Alpha', 1), csvTrack('Beta', 2)],
      [mbTrack('Alpha'), mbTrack('Beta')],
    )
    expect(tracklistMatchPercent(rows)).toBe(100)
    expect(isTracklistFullyAlignedByPosition(rows)).toBe(true)
  })

  it('returns false when a track mismatches', () => {
    const rows = compareTracklists([csvTrack('Alpha', 1)], [mbTrack('Different')])
    expect(isTracklistFullyAlignedByPosition(rows)).toBe(false)
  })

  it('returns false for empty comparison', () => {
    expect(isTracklistFullyAlignedByPosition([])).toBe(false)
  })
})
