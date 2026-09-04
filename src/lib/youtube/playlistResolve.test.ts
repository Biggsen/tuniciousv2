import { describe, expect, it } from 'vitest'

import { matchTracksToPlaylistVideos } from '@/lib/youtube/match'
import {
  isTopicChannelTitle,
  rankArtistChannels,
  scoreArtistChannelCandidate,
} from '@/lib/youtube/playlistResolve'
import type { YouTubeChannelCandidate, YouTubeVideoCandidate } from '@/types/youtube'

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
