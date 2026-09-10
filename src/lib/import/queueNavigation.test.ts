import { describe, expect, it } from 'vitest'

import { nextPendingAfter } from '@/lib/import/queueNavigation'
import type { StagedAlbum } from '@/lib/import/types'

function staged(id: string, status: StagedAlbum['status'] = 'pending'): StagedAlbum {
  return {
    id,
    albumUri: id,
    albumName: id,
    albumArtist: 'Artist',
    tracks: [],
    status,
  }
}

describe('nextPendingAfter', () => {
  const albums = [
    staged('a'),
    staged('b', 'imported'),
    staged('c'),
    staged('d'),
  ]

  it('returns the next pending album after the current one in list order', () => {
    expect(nextPendingAfter(albums, 'a')).toBe('c')
    expect(nextPendingAfter(albums, 'c')).toBe('d')
  })

  it('returns null when there is no later pending album', () => {
    expect(nextPendingAfter(albums, 'd')).toBeNull()
  })

  it('advances correctly after the current album was just imported', () => {
    const queue = [
      staged('first'),
      staged('second'),
      staged('third'),
      staged('fourth'),
    ]
    queue[2] = { ...queue[2], status: 'imported' }

    expect(nextPendingAfter(queue, 'third')).toBe('fourth')
  })
})
