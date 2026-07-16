import { getAlbumById, updateAlbumRating, updateAlbumSubmissionState } from '@/lib/album/firestore'
import { listPipelines } from '@/lib/pipeline/firestore'
import { isEvaluationPipeline } from '@/lib/pipeline/workflow'
import { listStagesByPipeline } from '@/lib/pipeline/stage'
import { listOpenMembershipsForPipeline } from '@/lib/pipeline/stageMembership'
import type { StarRating } from '@/types/pipeline'

export interface BackfillRatedExitRow {
  albumId: string
  stageName: string
  rating: StarRating
  action: 'updated' | 'submission-only' | 'skipped'
}

export interface BackfillRatedExitResult {
  updated: number
  submissionOnly: number
  skipped: number
  rows: BackfillRatedExitRow[]
}

/**
 * One-shot: set album_entries.rating from outcomeRating for albums currently
 * open on evaluation sink/terminal stages (covers migrated history without ratings).
 */
export async function backfillRatedExitRatings(uid: string): Promise<BackfillRatedExitResult> {
  const pipelines = await listPipelines(uid)
  const rows: BackfillRatedExitRow[] = []
  let updated = 0
  let submissionOnly = 0
  let skipped = 0

  for (const pipeline of pipelines) {
    const stages = await listStagesByPipeline(uid, pipeline.id)
    if (!isEvaluationPipeline(stages)) continue

    const ratedById = new Map(
      stages
        .filter((stage) => stage.outcomeRating !== undefined)
        .map((stage) => [stage.id, stage] as const),
    )
    if (ratedById.size === 0) continue

    const openMemberships = await listOpenMembershipsForPipeline(uid, pipeline.id)
    for (const membership of openMemberships) {
      const stage = ratedById.get(membership.stageId)
      if (!stage?.outcomeRating) continue

      const album = await getAlbumById(uid, membership.albumId)
      if (!album) {
        skipped++
        rows.push({
          albumId: membership.albumId,
          stageName: stage.name,
          rating: stage.outcomeRating,
          action: 'skipped',
        })
        continue
      }

      const ratingMatches =
        album.rating === stage.outcomeRating && album.ratingSource === 'pipeline'
      const submitted = album.ratingSubmittedPipelineId === pipeline.id

      if (ratingMatches && submitted) {
        skipped++
        rows.push({
          albumId: membership.albumId,
          stageName: stage.name,
          rating: stage.outcomeRating,
          action: 'skipped',
        })
        continue
      }

      if (!submitted) {
        await updateAlbumSubmissionState(uid, membership.albumId, {
          ratingSubmittedPipelineId: pipeline.id,
          ratingBeforeSubmission: album.ratingBeforeSubmission ?? album.rating ?? null,
        })
      }

      if (!ratingMatches) {
        await updateAlbumRating(uid, membership.albumId, stage.outcomeRating, 'pipeline')
        updated++
        rows.push({
          albumId: membership.albumId,
          stageName: stage.name,
          rating: stage.outcomeRating,
          action: 'updated',
        })
      } else {
        submissionOnly++
        rows.push({
          albumId: membership.albumId,
          stageName: stage.name,
          rating: stage.outcomeRating,
          action: 'submission-only',
        })
      }
    }
  }

  return { updated, submissionOnly, skipped, rows }
}
