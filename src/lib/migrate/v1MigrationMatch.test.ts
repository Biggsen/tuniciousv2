import { describe, expect, it } from 'vitest'

import { dryRunMatchV1Albums } from '@/lib/migrate/v1MigrationMatch'
import type { Album } from '@/types/library'
import type { V1MigrationAlbum } from '@/types/v1Migration'

function libraryAlbum(id: string, title: string, artist: string, tracks = 10): Album {
  return {
    id,
    title,
    artist,
    artistId: 'a1',
    artistIds: ['a1'],
    releaseMbid: `mb-${id}`,
    tracks: Array.from({ length: tracks }, (_, i) => ({
      id: `${id}-t${i}`,
      title: `Track ${i + 1}`,
      trackNumber: String(i + 1),
    })),
    importedAt: new Date(),
  }
}

function stagingAlbum(id: string, title: string, artist: string): V1MigrationAlbum {
  return {
    v1AlbumId: id,
    albumTitle: title,
    artistName: artist,
    playlistHistory: [],
    migration: { status: 'pending' },
  }
}

describe('dryRunMatchV1Albums', () => {
  it('maps a single clear title+artist hit', () => {
    const results = dryRunMatchV1Albums(
      [stagingAlbum('v1', 'Fang Island', 'Fang Island')],
      [libraryAlbum('v2', 'Fang Island', 'Fang Island')],
    )
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('mapped')
    expect(results[0].v2AlbumId).toBe('v2')
  })

  it('flags edition qualifier differences as suggested', () => {
    const results = dryRunMatchV1Albums(
      [stagingAlbum('v1', 'OK Computer (Deluxe)', 'Radiohead')],
      [libraryAlbum('v2', 'OK Computer', 'Radiohead')],
    )
    expect(results[0].status).toBe('suggested')
    expect(results[0].warning).toMatch(/Edition/)
  })

  it('returns unmatched when nothing fits', () => {
    const results = dryRunMatchV1Albums(
      [stagingAlbum('v1', 'Unknown Album', 'Nobody')],
      [libraryAlbum('v2', 'Fang Island', 'Fang Island')],
    )
    expect(results[0].status).toBe('unmatched')
  })

  it('returns suggested when multiple candidates match', () => {
    const results = dryRunMatchV1Albums(
      [stagingAlbum('v1', 'OK Computer', 'Radiohead')],
      [
        libraryAlbum('a', 'OK Computer', 'Radiohead', 12),
        libraryAlbum('b', 'OK Computer (Deluxe Edition)', 'Radiohead', 20),
      ],
    )
    expect(results[0].status).toBe('suggested')
    expect(results[0].candidates).toHaveLength(2)
  })
})
