import { describe, expect, it } from 'vitest'

import {
  parseLastfmTrackUserInfo,
  parseLovedTracksPage,
  parseUserTrackLoved,
  parseUserTrackPlaycount,
} from '@/lib/lastfm/client'
import { lastfmLovedKey, matchLovedTrack } from '@/lib/lastfm/normalize'

describe('parseUserTrackPlaycount', () => {
  it('reads userplaycount from track.getInfo response', () => {
    expect(parseUserTrackPlaycount({ track: { userplaycount: '12' } })).toBe(12)
  })

  it('returns 0 when userplaycount is missing', () => {
    expect(parseUserTrackPlaycount({ track: { playcount: '99983' } })).toBe(0)
  })
})

describe('parseUserTrackLoved', () => {
  it('treats userloved 1 as loved', () => {
    expect(parseUserTrackLoved({ track: { userloved: '1' } })).toBe(true)
    expect(parseUserTrackLoved({ track: { userloved: 1 } })).toBe(true)
  })

  it('treats missing or 0 as not loved', () => {
    expect(parseUserTrackLoved({ track: { userloved: '0' } })).toBe(false)
    expect(parseUserTrackLoved({ track: { playcount: '9' } })).toBe(false)
  })
})

describe('parseLastfmTrackUserInfo', () => {
  it('reads playcount and loved together', () => {
    expect(
      parseLastfmTrackUserInfo({ track: { userplaycount: '4', userloved: '1' } }),
    ).toEqual({ playcount: 4, loved: true })
  })
})

describe('parseLovedTracksPage', () => {
  it('reads an array of loved tracks', () => {
    const parsed = parseLovedTracksPage({
      lovedtracks: {
        track: [
          { name: 'Helplessness Blues', artist: { name: 'Fleet Foxes' } },
          { name: 'Two Weeks', artist: { '#text': 'Grizzly Bear' } },
        ],
        '@attr': { page: '2', totalPages: '5' },
      },
    })
    expect(parsed).toEqual({
      tracks: [
        { artist: 'Fleet Foxes', title: 'Helplessness Blues' },
        { artist: 'Grizzly Bear', title: 'Two Weeks' },
      ],
      page: 2,
      totalPages: 5,
    })
  })

  it('wraps a single loved track object', () => {
    const parsed = parseLovedTracksPage({
      lovedtracks: {
        track: { name: 'Myth', artist: 'Beach House' },
        '@attr': { page: '1', totalPages: '1' },
      },
    })
    expect(parsed.tracks).toEqual([{ artist: 'Beach House', title: 'Myth' }])
  })
})

describe('matchLovedTrack', () => {
  const keys = new Set([lastfmLovedKey('Radiohead', 'Karma Police')])

  it('matches scrobble artist and title', () => {
    expect(matchLovedTrack('Radiohead', 'Radiohead', 'Karma Police', keys)).toBe(true)
  })

  it('matches the album artist fallback', () => {
    expect(matchLovedTrack('Thom Yorke', 'Radiohead', 'Karma Police', keys)).toBe(true)
  })

  it('does not match a different title', () => {
    expect(matchLovedTrack('Radiohead', 'Radiohead', 'Creep', keys)).toBe(false)
  })
})
