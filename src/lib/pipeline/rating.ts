import type { Album } from '@/types/library'
import type { PipelineRole, RatingSource, StarRating, Stage } from '@/types/pipeline'

export type AlbumRatingDisplayState =
  | 'unrated'
  | 'manual'
  | 'in-evaluation'
  | 'rated-in-pipeline'
  | 'rated-out'

export interface AlbumRatingDisplay {
  state: AlbumRatingDisplayState
  editable: boolean
  rating?: StarRating
  label?: string
  stageName?: string
}

type RatingAlbumFields = Pick<
  Album,
  'rating' | 'ratingSource' | 'ratingSubmittedPipelineId' | 'ratingBeforeSubmission'
>

/** True when the album is submitted to an evaluation funnel (manual rating locked). */
export function isSubmittedToEvaluation(album: RatingAlbumFields): boolean {
  return Boolean(album.ratingSubmittedPipelineId)
}

/**
 * Display/edit rules without requiring an open membership fetch.
 * Uses submission + ratingSource as a proxy for stage role:
 * - submitted + not pipeline-sourced → in evaluation (source/transient)
 * - submitted + pipeline-sourced → rated in pipeline (sink/terminal)
 */
export function resolveAlbumRatingDisplay(
  album: RatingAlbumFields,
  options: { stageName?: string; pipelineRole?: PipelineRole } = {},
): AlbumRatingDisplay {
  const submitted = isSubmittedToEvaluation(album)
  const role = options.pipelineRole

  if (role === 'source' || role === 'transient' || (submitted && album.ratingSource !== 'pipeline')) {
    return {
      state: 'in-evaluation',
      editable: false,
      rating: undefined,
      label: options.stageName ? `Evaluating · ${options.stageName}` : 'Evaluating',
      stageName: options.stageName,
    }
  }

  if (role === 'sink' || role === 'terminal' || (submitted && album.ratingSource === 'pipeline')) {
    return {
      state: 'rated-in-pipeline',
      editable: false,
      rating: album.rating,
      label: 'From evaluation',
      stageName: options.stageName,
    }
  }

  if (album.rating != null) {
    return {
      state: album.ratingSource === 'pipeline' ? 'rated-out' : 'manual',
      editable: true,
      rating: album.rating,
      label: album.ratingSource === 'pipeline' ? 'From evaluation' : 'Your rating',
    }
  }

  return {
    state: 'unrated',
    editable: true,
    rating: undefined,
  }
}

export function shouldAutoRateOnLand(stage: Pick<Stage, 'outcomeRating'>): stage is Stage & {
  outcomeRating: StarRating
} {
  return stage.outcomeRating !== undefined
}

export function needsSubmissionOverwriteConfirm(album: RatingAlbumFields): boolean {
  return album.rating != null && !isSubmittedToEvaluation(album)
}
