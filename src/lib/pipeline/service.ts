import { getPipelineById } from '@/lib/pipeline/firestore'
import { getStageByPlaylistId, listStagesByPipeline } from '@/lib/pipeline/stage'
import {
  closeStageMembership,
  getOpenMembershipForAlbumPipeline,
  listMembershipHistoryForAlbumPipeline,
  listOpenMembershipsForAlbum,
  listOpenMembershipsForPipeline,
  openStageMembership,
  reopenStageMembership,
} from '@/lib/pipeline/stageMembership'
import { getAvailableActions, isEvaluationPipeline, resolveAdvanceTarget } from '@/lib/pipeline/workflow'
import {
  addAlbumToPlaylist,
  listPlaylistsByPipelineId,
  removeAlbumFromPlaylist,
} from '@/lib/playlist/firestore'
import type { Pipeline, PipelineGraph, Stage, StageMembership, WorkflowAction } from '@/types/pipeline'

export class WorkflowEligibilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowEligibilityError'
  }
}

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

export function isSafeWorkflowTemplate(templateId: Pipeline['templateId']): boolean {
  return templateId === 'filter'
}

function stageById(stages: Stage[], stageId: string): Stage {
  const stage = stages.find((entry) => entry.id === stageId)
  if (!stage) {
    throw new WorkflowEligibilityError('Stage not found in this funnel')
  }
  return stage
}

async function loadStageGraphForPlaylist(uid: string, playlistId: string) {
  const stage = await getStageByPlaylistId(uid, playlistId)
  if (!stage) return null

  const graph = await loadPipelineGraph(uid, stage.pipelineId)
  if (!graph) return null

  return {
    graph,
    stage: graph.stages.find((entry) => entry.id === stage.id) ?? stage,
  }
}

function assertWorkflowEligible(
  pipeline: Pipeline,
  membership: StageMembership | null,
): void {
  if (membership) return
  if (!isSafeWorkflowTemplate(pipeline.templateId)) {
    throw new WorkflowEligibilityError(
      'Legacy album on evaluation funnel is not workflow-enabled until migration.',
    )
  }
}

async function ensureCurrentMembership(
  uid: string,
  graph: PipelineGraph,
  stage: Stage,
  albumId: string,
): Promise<StageMembership> {
  let open = await getOpenMembershipForAlbumPipeline(uid, albumId, graph.pipeline.id)

  if (!open) {
    assertWorkflowEligible(graph.pipeline, open)
    return openStageMembership(uid, {
      albumId,
      pipelineId: graph.pipeline.id,
      stageId: stage.id,
      pipelineRole: stage.pipelineRole,
    })
  }

  if (open.stageId === stage.id) return open

  await closeStageMembership(uid, open.id)
  return openStageMembership(uid, {
    albumId,
    pipelineId: graph.pipeline.id,
    stageId: stage.id,
    pipelineRole: stage.pipelineRole,
  })
}

async function syncStagePlaylistMembership(
  uid: string,
  albumId: string,
  fromPlaylistId: string,
  toPlaylistId: string,
) {
  if (fromPlaylistId !== toPlaylistId) {
    await removeAlbumFromPlaylist(uid, fromPlaylistId, albumId)
  }
  await addAlbumToPlaylist(uid, toPlaylistId, albumId)
}

export async function applyWorkflowAction(
  uid: string,
  input: {
    playlistId: string
    albumId: string
    action: WorkflowAction
  },
): Promise<void> {
  const context = await loadStageGraphForPlaylist(uid, input.playlistId)
  if (!context) {
    throw new WorkflowEligibilityError('Playlist is not mapped to a funnel stage')
  }

  const { graph, stage } = context
  const membership = await ensureCurrentMembership(uid, graph, stage, input.albumId)
  const currentStage = stageById(graph.stages, membership.stageId)
  const targetStageId = resolveAdvanceTarget(currentStage, input.action)
  const targetStage = stageById(graph.stages, targetStageId)

  await closeStageMembership(uid, membership.id)
  await openStageMembership(uid, {
    albumId: input.albumId,
    pipelineId: graph.pipeline.id,
    stageId: targetStage.id,
    pipelineRole: targetStage.pipelineRole,
  })

  await syncStagePlaylistMembership(
    uid,
    input.albumId,
    currentStage.playlistId,
    targetStage.playlistId,
  )
}

export async function undoLastWorkflowStep(
  uid: string,
  input: {
    playlistId: string
    albumId: string
  },
): Promise<void> {
  const context = await loadStageGraphForPlaylist(uid, input.playlistId)
  if (!context) {
    throw new WorkflowEligibilityError('Playlist is not mapped to a funnel stage')
  }

  const { graph, stage } = context
  const membership = await ensureCurrentMembership(uid, graph, stage, input.albumId)
  const history = await listMembershipHistoryForAlbumPipeline(uid, input.albumId, graph.pipeline.id)
  const previous = history.find(
    (item) => item.id !== membership.id && item.stageId !== membership.stageId,
  )

  if (!previous) {
    throw new WorkflowEligibilityError('Nothing to undo for this album yet')
  }

  const previousStage = stageById(graph.stages, previous.stageId)
  const currentStage = stageById(graph.stages, membership.stageId)

  await closeStageMembership(uid, membership.id)
  await reopenStageMembership(uid, previous.id)

  await syncStagePlaylistMembership(
    uid,
    input.albumId,
    currentStage.playlistId,
    previousStage.playlistId,
  )
}

export async function handleStagePlaylistAdd(
  uid: string,
  input: { playlistId: string; albumId: string },
): Promise<void> {
  await addAlbumToPlaylist(uid, input.playlistId, input.albumId)
  const context = await loadStageGraphForPlaylist(uid, input.playlistId)
  if (!context) return

  const { graph, stage } = context
  if (!isSafeWorkflowTemplate(graph.pipeline.templateId)) return

  const open = await getOpenMembershipForAlbumPipeline(uid, input.albumId, graph.pipeline.id)
  if (open) return

  await openStageMembership(uid, {
    albumId: input.albumId,
    pipelineId: graph.pipeline.id,
    stageId: stage.id,
    pipelineRole: stage.pipelineRole,
  })
}

export async function handleStagePlaylistRemoval(
  uid: string,
  input: { playlistId: string; albumId: string },
): Promise<void> {
  await removeAlbumFromPlaylist(uid, input.playlistId, input.albumId)
  const context = await loadStageGraphForPlaylist(uid, input.playlistId)
  if (!context) return

  const open = await getOpenMembershipForAlbumPipeline(uid, input.albumId, context.graph.pipeline.id)
  if (!open) return

  if (open.stageId === context.stage.id) {
    await closeStageMembership(uid, open.id)
  }
}

export interface PlaylistWorkflowRowState {
  actions: WorkflowAction[]
  canUndo: boolean
  blockedReason?: string
}

export async function listPlaylistWorkflowStates(
  uid: string,
  playlistId: string,
  albumIds: string[],
): Promise<{
  enabled: boolean
  blockedReason?: string
  byAlbumId: Map<string, PlaylistWorkflowRowState>
}> {
  const context = await loadStageGraphForPlaylist(uid, playlistId)
  if (!context) {
    return { enabled: false, byAlbumId: new Map() }
  }

  const safeTemplate = isSafeWorkflowTemplate(context.graph.pipeline.templateId)
  const openMemberships = await listPipelineOpenMemberships(uid, context.graph.pipeline.id)
  const openByAlbumId = new Map(openMemberships.map((membership) => [membership.albumId, membership]))
  const byAlbumId = new Map<string, PlaylistWorkflowRowState>()

  await Promise.all(
    albumIds.map(async (albumId) => {
      const open = openByAlbumId.get(albumId)
      if (!open && !safeTemplate) {
        byAlbumId.set(albumId, {
          actions: [],
          canUndo: false,
          blockedReason: 'Awaiting migration: workflow disabled for legacy evaluation rows.',
        })
        return
      }

      const actions = getAvailableActions(context.stage)
      let canUndo = false
      if (open) {
        const history = await listMembershipHistoryForAlbumPipeline(
          uid,
          albumId,
          context.graph.pipeline.id,
        )
        canUndo = history.some((entry) => entry.id !== open.id && entry.stageId !== open.stageId)
      }

      byAlbumId.set(albumId, { actions, canUndo })
    }),
  )

  return {
    enabled: true,
    blockedReason: safeTemplate
      ? undefined
      : 'Evaluation funnel workflow is locked until history migration.',
    byAlbumId,
  }
}

export async function isPlaylistWorkflowEnabled(uid: string, playlistId: string): Promise<boolean> {
  const context = await loadStageGraphForPlaylist(uid, playlistId)
  return Boolean(context)
}

export { isEvaluationPipeline } from '@/lib/pipeline/workflow'
export { deletePipelineCompletely } from '@/lib/pipeline/deletePipeline'
