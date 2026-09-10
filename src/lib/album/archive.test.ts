import { describe, expect, it } from 'vitest'

import { isAlbumArchived } from '@/lib/album/archive'

describe('isAlbumArchived', () => {
  it('returns true when archivedAt is set', () => {
    expect(isAlbumArchived({ archivedAt: new Date('2026-01-01') })).toBe(true)
  })

  it('returns false when archivedAt is missing', () => {
    expect(isAlbumArchived({})).toBe(false)
  })
})
