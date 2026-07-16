import { describe, expect, it } from 'vitest'

import { matchPlaylistFromFilename, matchPlaylistFromNormalizedName, normalizeCsvFilename } from '@/lib/import/matchPlaylistFromFilename'
import type { Playlist } from '@/types/library'

function playlist(id: string, name: string): Playlist {
  return {
    id,
    name,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('normalizeCsvFilename', () => {
  it('strips extension and converts underscores', () => {
    expect(normalizeCsvFilename('new_⭐.csv')).toBe('new ⭐')
    expect(normalizeCsvFilename('Known_Artists_-_Queued.CSV')).toBe('known artists - queued')
  })
})

describe('matchPlaylistFromFilename', () => {
  const playlists = [
    playlist('p1', 'New - Queued'),
    playlist('p2', 'New - ⭐'),
    playlist('p3', 'Casual'),
  ]

  it('matches collapsed funnel-stage names from exportify filenames', () => {
    expect(matchPlaylistFromFilename('new_⭐.csv', playlists)?.id).toBe('p2')
  })

  it('matches exact playlist names', () => {
    expect(matchPlaylistFromFilename('Casual.csv', playlists)?.id).toBe('p3')
  })

  it('matches dashed export filenames', () => {
    expect(matchPlaylistFromFilename('Known Artists - Queued.csv', [playlist('p4', 'Known Artists - Queued')])?.id).toBe(
      'p4',
    )
  })

  it('matches unique stage segment only', () => {
    expect(matchPlaylistFromFilename('queued.csv', playlists)?.id).toBe('p1')
  })

  it('returns null when segment is ambiguous', () => {
    const ambiguous = [playlist('a', 'Funnel A - Good'), playlist('b', 'Funnel B - Good')]
    expect(matchPlaylistFromFilename('good.csv', ambiguous)).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(matchPlaylistFromFilename('mystery.csv', playlists)).toBeNull()
  })
})

describe('matchPlaylistFromNormalizedName', () => {
  it('matches stage hint without CSV filename', () => {
    const playlists = [playlist('p1', 'New - Queued'), playlist('p2', 'New - Curious')]
    expect(matchPlaylistFromNormalizedName('Queued', playlists)?.id).toBe('p1')
  })
})
