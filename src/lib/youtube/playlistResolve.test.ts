import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildQueueFromAlbum } from '@/lib/playback/queue'
import { matchTracksToPlaylistVideos } from '@/lib/youtube/match'
import {
  findPlayableVideoForTrack,
  isTopicChannelTitle,
  rankArtistChannels,
  scoreArtistChannelCandidate,
} from '@/lib/youtube/playlistResolve'
import type { Album } from '@/types/library'
import type { TrackYouTubeMapping, YouTubeChannelCandidate, YouTubeVideoCandidate } from '@/types/youtube'

const searchVideos = vi.fn()

vi.mock('@/lib/youtube/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/youtube/client')>()
  return {
    ...mod,
    searchVideos: (...args: unknown[]) => searchVideos(...args),
  }
})

describe('isTopicChannelTitle', () => {
  it('detects Topic channels', () => {
    expect(isTopicChannelTitle('Khemmis - Topic')).toBe(true)
    expect(isTopicChannelTitle('Khemmis')).toBe(false)
  })
})

describe('rankArtistChannels', () => {
  it('prefers Topic channel over plain artist channel', () => {
    const channels: YouTubeChannelCandidate[] = [
      { channelId: 'plain', channelTitle: 'Pomrad' },
      { channelId: 'topic', channelTitle: 'Pomrad - Topic' },
      { channelId: 'other', channelTitle: 'Some Other Band - Topic' },
    ]

    expect(rankArtistChannels(channels, 'Pomrad').map((c) => c.channelId)).toEqual([
      'topic',
      'plain',
    ])
  })

  it('scores Topic highest', () => {
    expect(
      scoreArtistChannelCandidate(
        { channelId: '1', channelTitle: 'Pomrad - Topic' },
        'Pomrad',
      ),
    ).toBe(100)
    expect(
      scoreArtistChannelCandidate({ channelId: '2', channelTitle: 'Pomrad' }, 'Pomrad'),
    ).toBe(80)
  })
})

describe('matchTracksToPlaylistVideos for channel uploads', () => {
  it('matches Knights album tracks to Topic upload titles', () => {
    const tracks = [
      { id: 't1', trackNumber: '1', title: 'Knights', lengthMs: 200_000 },
      { id: 't2', trackNumber: '2', title: 'Out Like a Light', lengthMs: 180_000 },
      { id: 't3', trackNumber: '3', title: 'Missing Song', lengthMs: 120_000 },
    ]
    const videos: YouTubeVideoCandidate[] = [
      {
        videoId: 'v1',
        title: 'Knights',
        channelId: 'ch',
        channelTitle: 'Pomrad - Topic',
        durationMs: 201_000,
      },
      {
        videoId: 'v2',
        title: 'Out Like a Light',
        channelId: 'ch',
        channelTitle: 'Pomrad - Topic',
        durationMs: 179_000,
      },
      {
        videoId: 'v3',
        title: 'Dans',
        channelId: 'ch',
        channelTitle: 'Pomrad - Topic',
      },
    ]

    const matches = matchTracksToPlaylistVideos(tracks, videos)
    expect(matches.get('t1')?.videoId).toBe('v1')
    expect(matches.get('t2')?.videoId).toBe('v2')
    expect(matches.has('t3')).toBe(false)
  })
})

describe('findPlayableVideoForTrack', () => {
  beforeEach(() => {
    searchVideos.mockReset()
  })

  it('prefers a non-Topic candidate over Topic', async () => {
    searchVideos.mockResolvedValue([
      {
        videoId: 'topic-vid',
        title: 'Above the Water',
        channelId: 'topic-ch',
        channelTitle: 'Khemmis - Topic',
        durationMs: 440_000,
      },
      {
        videoId: 'fan-vid',
        title: 'Khemmis - Above the Water',
        channelId: 'fan-ch',
        channelTitle: 'SevereRepugnance',
        durationMs: 442_000,
      },
    ] satisfies YouTubeVideoCandidate[])

    const picked = await findPlayableVideoForTrack(
      'Khemmis',
      { id: 't1', trackNumber: '1', title: 'Above the Water', lengthMs: 442_000 },
      {
        videoId: 'topic-vid',
        title: 'Above the Water',
        channelId: 'topic-ch',
        channelTitle: 'Khemmis - Topic',
      },
    )

    expect(searchVideos).toHaveBeenCalledOnce()
    expect(picked?.videoId).toBe('fan-vid')
    expect(picked?.channelTitle).toBe('SevereRepugnance')
  })
})

describe('buildQueueFromAlbum', () => {
  it('copies channel fields from mappings', () => {
    const album: Album = {
      id: 'a1',
      title: 'Hunted',
      artist: 'Khemmis',
      artistId: 'art1',
      artistIds: ['art1'],
      albumYear: '2016',
      releaseMbid: 'mb',
      tracks: [{ id: 't1', trackNumber: '1', title: 'Above the Water', lengthMs: 1000 }],
      importedAt: new Date('2026-01-01'),
    }
    const mappings = new Map<string, TrackYouTubeMapping>([
      [
        't1',
        {
          trackId: 't1',
          videoId: 'vid1',
          videoTitle: 'Above the Water',
          channelTitle: 'Khemmis - Topic',
          channelId: 'ch1',
          source: 'auto',
          resolvedAt: new Date(),
        },
      ],
    ])

    const queue = buildQueueFromAlbum(album, mappings)
    expect(queue[0]?.videoId).toBe('vid1')
    expect(queue[0]?.channelTitle).toBe('Khemmis - Topic')
    expect(queue[0]?.channelId).toBe('ch1')
    expect(queue[0]?.mappingSource).toBe('auto')
  })
})
