import type { Album } from '@/types/library'
import type { PipelineRole, StarRating, Stage } from '@/types/pipeline'

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
 * Display/edit rules for §7.4.
 * Prefer explicit `pipelineRole` / `stageName` when known (open StageMembership);
 * otherwise infer from submission + ratingSource.
 */
export function resolveAlbumRatingDisplay(
  album: RatingAlbumFields,
  options: { stageName?: string; pipelineRole?: PipelineRole } = {},
): AlbumRatingDisplay {
  const submitted = isSubmittedToEvaluation(album)
  const role = options.pipelineRole

  const inSourceOrTransient =
    role === 'source' ||
    role === 'transient' ||
    (role === undefined && submitted && album.ratingSource !== 'pipeline')

  if (inSourceOrTransient) {
    return {
      state: 'in-evaluation',
      editable: false,
      rating: undefined,
      label: options.stageName ? `Evaluating · ${options.stageName}` : 'Evaluating',
      stageName: options.stageName,
    }
  }

  const onRatedExit =
    role === 'sink' ||
    role === 'terminal' ||
    (role === undefined && submitted && album.ratingSource === 'pipeline')

  if (onRatedExit) {
    return {
      state: 'rated-in-pipeline',
      editable: false,
      rating: album.rating,
      label: options.stageName ? `From evaluation · ${options.stageName}` : 'From evaluation',
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
