import { getPipelineById } from '@/lib/pipeline/firestore'
import { listStagesByPipeline } from '@/lib/pipeline/stage'
import {
  getOpenMembershipForAlbumPipeline,
  listOpenMembershipsForAlbum,
  listOpenMembershipsForPipeline,
} from '@/lib/pipeline/stageMembership'
import { isEvaluationPipeline } from '@/lib/pipeline/workflow'
import { listPlaylistsByPipelineId } from '@/lib/playlist/firestore'
import type { PipelineGraph, Stage, StageMembership } from '@/types/pipeline'

export async function loadPipelineGraph(
  uid: string,
  pipelineId: string,
): Promise<PipelineGraph | null> {
  const pipeline = await getPipelineById(uid, pipelineId)
  if (!pipeline) return null

  const [stages, playlists] = await Promise.all([
    listStagesByPipeline(uid, pipelineId),
    listPlaylistsByPipelineId(uid, pipelineId),
  ])
  return { pipeline, stages, playlists }
}

export async function isPipelineEvaluation(uid: string, pipelineId: string): Promise<boolean> {
  const stages = await listStagesByPipeline(uid, pipelineId)
  return isEvaluationPipeline(stages)
}

export async function getOpenAlbumMembershipInPipeline(
  uid: string,
  albumId: string,
  pipelineId: string,
): Promise<StageMembership | null> {
  return getOpenMembershipForAlbumPipeline(uid, albumId, pipelineId)
}

export async function listPipelineOpenMemberships(
  uid: string,
  pipelineId: string,
): Promise<StageMembership[]> {
  return listOpenMembershipsForPipeline(uid, pipelineId)
}

export async function listAlbumOpenMemberships(
  uid: string,
  albumId: string,
): Promise<StageMembership[]> {
  return listOpenMembershipsForAlbum(uid, albumId)
}

export function findStageForPlaylist(stages: Stage[], playlistId: string): Stage | undefined {
  return stages.find((stage) => stage.playlistId === playlistId)
}

export function getStagePlaylistIds(stages: Stage[]): string[] {
  return stages.map((stage) => stage.playlistId)
}

export { isEvaluationPipeline } from '@/lib/pipeline/workflow'
export { deletePipelineCompletely } from '@/lib/pipeline/deletePipeline'
