import { listPipelines } from '@/lib/pipeline/firestore'
import { listStagesByPipeline } from '@/lib/pipeline/stage'
import {
  listOpenMembershipsForAlbum,
  listOpenMembershipsForPipeline,
} from '@/lib/pipeline/stageMembership'
import { isEvaluationPipeline } from '@/lib/pipeline/workflow'
import type { PipelineRole } from '@/types/pipeline'

export interface AlbumEvaluationStageContext {
  pipelineId: string
  stageId: string
  stageName: string
  pipelineRole: PipelineRole
}

/**
 * Open evaluation-stage context keyed by album id (at most one open membership
 * per evaluation pipeline; if multiple pipelines, first wins).
 */
export async function listAlbumEvaluationStageContexts(
  uid: string,
): Promise<Map<string, AlbumEvaluationStageContext>> {
  const result = new Map<string, AlbumEvaluationStageContext>()
  const pipelines = await listPipelines(uid)

  for (const pipeline of pipelines) {
    const stages = await listStagesByPipeline(uid, pipeline.id)
    if (!isEvaluationPipeline(stages)) continue

    const stageById = new Map(stages.map((stage) => [stage.id, stage]))
    const openMemberships = await listOpenMembershipsForPipeline(uid, pipeline.id)

    for (const membership of openMemberships) {
      if (result.has(membership.albumId)) continue
      const stage = stageById.get(membership.stageId)
      if (!stage) continue
      result.set(membership.albumId, {
        pipelineId: pipeline.id,
        stageId: stage.id,
        stageName: stage.name,
        pipelineRole: stage.pipelineRole,
      })
    }
  }

  return result
}

export async function getAlbumEvaluationStageContext(
  uid: string,
  albumId: string,
): Promise<AlbumEvaluationStageContext | null> {
  const openMemberships = await listOpenMembershipsForAlbum(uid, albumId)
  if (openMemberships.length === 0) return null

  for (const membership of openMemberships) {
    const stages = await listStagesByPipeline(uid, membership.pipelineId)
    if (!isEvaluationPipeline(stages)) continue
    const stage = stages.find((entry) => entry.id === membership.stageId)
    if (!stage) continue
    return {
      pipelineId: membership.pipelineId,
      stageId: stage.id,
      stageName: stage.name,
      pipelineRole: stage.pipelineRole,
    }
  }

  return null
}
