import { describe, expect, it } from 'vitest'

import {
  needsSubmissionOverwriteConfirm,
  resolveAlbumRatingDisplay,
  shouldAutoRateOnLand,
} from '@/lib/pipeline/rating'

describe('resolveAlbumRatingDisplay', () => {
  it('hides stars while submitted on source/transient', () => {
    const display = resolveAlbumRatingDisplay({
      rating: 4,
      ratingSource: 'manual',
      ratingSubmittedPipelineId: 'pipe-1',
    })
    expect(display.state).toBe('in-evaluation')
    expect(display.editable).toBe(false)
    expect(display.rating).toBeUndefined()
  })

  it('shows pipeline rating on sink while submitted', () => {
    const display = resolveAlbumRatingDisplay({
      rating: 3,
      ratingSource: 'pipeline',
      ratingSubmittedPipelineId: 'pipe-1',
    })
    expect(display.state).toBe('rated-in-pipeline')
    expect(display.editable).toBe(false)
    expect(display.rating).toBe(3)
  })

  it('allows manual edit when not submitted', () => {
    const display = resolveAlbumRatingDisplay({
      rating: 5,
      ratingSource: 'manual',
    })
    expect(display.state).toBe('manual')
    expect(display.editable).toBe(true)
  })
})

describe('needsSubmissionOverwriteConfirm', () => {
  it('requires confirm only when a rating exists and not yet submitted', () => {
    expect(needsSubmissionOverwriteConfirm({ rating: 4 })).toBe(true)
    expect(needsSubmissionOverwriteConfirm({})).toBe(false)
    expect(
      needsSubmissionOverwriteConfirm({
        rating: 4,
        ratingSubmittedPipelineId: 'pipe-1',
      }),
    ).toBe(false)
  })
})

describe('shouldAutoRateOnLand', () => {
  it('is true when outcomeRating is set', () => {
    expect(shouldAutoRateOnLand({ outcomeRating: 2 })).toBe(true)
    expect(shouldAutoRateOnLand({})).toBe(false)
  })
})
