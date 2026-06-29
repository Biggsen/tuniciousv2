import { describe, expect, it } from 'vitest'

import {
  albumTitleMatchKeys,
  normalizeAlbumTitleForMatch,
  stripEditionQualifiers,
} from '@/lib/import/normalizeAlbumTitle'

describe('stripEditionQualifiers', () => {
  it('strips deluxe and standard edition suffixes', () => {
    expect(stripEditionQualifiers('Fang Island (Deluxe Edition)')).toBe('Fang Island')
    expect(stripEditionQualifiers('Album (Standard Edition)')).toBe('Album')
    expect(stripEditionQualifiers('channel ORANGE (Expanded Edition)')).toBe('channel ORANGE')
  })

  it('keeps non-edition parentheticals', () => {
    expect(stripEditionQualifiers('Live at Wembley (Recorded 1975)')).toBe(
      'Live at Wembley (Recorded 1975)',
    )
  })
})

describe('albumTitleMatchKeys', () => {
  it('includes a core key for edition-heavy csv titles', () => {
    expect(albumTitleMatchKeys('Fang Island (Deluxe Edition)')).toContain(
      normalizeAlbumTitleForMatch('Fang Island'),
    )
  })
})
