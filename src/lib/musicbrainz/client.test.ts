import { describe, expect, it } from 'vitest'

import { formatMusicBrainzUserMessage, MusicBrainzError } from '@/lib/musicbrainz/client'

describe('formatMusicBrainzUserMessage', () => {
  it('explains temporary 500s without raw status jargon only', () => {
    expect(formatMusicBrainzUserMessage(new MusicBrainzError('x', 500), 'fallback')).toBe(
      'MusicBrainz returned an error. Try again in a moment.',
    )
  })

  it('maps network failures to a connection message', () => {
    expect(formatMusicBrainzUserMessage(new TypeError('Failed to fetch'), 'fallback')).toBe(
      'Could not reach MusicBrainz. Check your connection and try again.',
    )
  })
})
