import { describe, expect, it } from 'vitest'

import { importSkipReasonLabel } from '@/lib/import/skipReasons'

describe('importSkipReasonLabel', () => {
  it('labels known reasons', () => {
    expect(importSkipReasonLabel('edition-not-listed')).toBe('Edition not in MusicBrainz list')
    expect(importSkipReasonLabel('artist-not-on-mb')).toBe('Artist not on MusicBrainz')
    expect(importSkipReasonLabel('other')).toBe('Other')
  })

  it('falls back when missing', () => {
    expect(importSkipReasonLabel(undefined)).toBe('Skipped')
  })
})
