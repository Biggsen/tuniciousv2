import { getAlbumById, updateAlbumSubmissionState } from '@/lib/album/firestore'
import { listPipelines } from '@/lib/pipeline/firestore'
import { listStagesByPipeline } from '@/lib/pipeline/stage'
import {
  listOpenMembershipsForPipeline,
  openStageMembership,
} from '@/lib/pipeline/stageMembership'
import { isEvaluationPipeline, isSafeWorkflowTemplate } from '@/lib/pipeline/service'
import { listPlaylistMemberships } from '@/lib/playlist/firestore'
import type { PipelineRole } from '@/types/pipeline'

export interface BackfillMissingStageMembershipRow {
  albumId: string
  playlistId: string
  stageName: string
  action: 'created' | 'skipped' | 'skipped-other-stage'
}

export interface BackfillMissingStageMembershipResult {
  created: number
  skipped: number
  skippedOtherStage: number
  rows: BackfillMissingStageMembershipRow[]
}

/**
 * Open StageMembership (+ evaluation submission) for albums that are on a stage
 * playlist but have no open membership for that pipeline — e.g. import sync that
 * only wrote PlaylistMembership.
 */
export async function backfillMissingStageMemberships(
  uid: string,
): Promise<BackfillMissingStageMembershipResult> {
  const pipelines = await listPipelines(uid)
  const rows: BackfillMissingStageMembershipRow[] = []
  let created = 0
  let skipped = 0
  let skippedOtherStage = 0

  for (const pipeline of pipelines) {
    if (!isSafeWorkflowTemplate(pipeline.templateId)) continue

    const stages = await listStagesByPipeline(uid, pipeline.id)
    if (stages.length === 0) continue

    const openMemberships = await listOpenMembershipsForPipeline(uid, pipeline.id)
    const openByAlbumId = new Map(
      openMemberships.map((membership) => [membership.albumId, membership]),
    )
    const evaluation = isEvaluationPipeline(stages)

    for (const stage of stages) {
      const members = await listPlaylistMemberships(uid, stage.playlistId)

      for (const member of members) {
        const open = openByAlbumId.get(member.albumId)
        if (open?.stageId === stage.id) {
          skipped++
          continue
        }
        if (open) {
          skippedOtherStage++
          rows.push({
            albumId: member.albumId,
            playlistId: stage.playlistId,
            stageName: stage.name,
            action: 'skipped-other-stage',
          })
          continue
        }

        await openStageMembership(uid, {
          albumId: member.albumId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          pipelineRole: stage.pipelineRole as PipelineRole,
          addedAt: member.addedAt,
        })

        if (evaluation) {
          const album = await getAlbumById(uid, member.albumId)
          if (album && album.ratingSubmittedPipelineId !== pipeline.id) {
            await updateAlbumSubmissionState(uid, member.albumId, {
              ratingBeforeSubmission: album.rating ?? null,
              ratingSubmittedPipelineId: pipeline.id,
            })
          }
        }

        openByAlbumId.set(member.albumId, {
          id: 'new',
          albumId: member.albumId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          pipelineRole: stage.pipelineRole,
          addedAt: member.addedAt,
        })

        created++
        rows.push({
          albumId: member.albumId,
          playlistId: stage.playlistId,
          stageName: stage.name,
          action: 'created',
        })
      }
    }
  }

  return { created, skipped, skippedOtherStage, rows }
}
