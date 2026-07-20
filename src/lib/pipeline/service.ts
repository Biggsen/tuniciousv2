import { getAlbumById, updateAlbumRating, updateAlbumSubmissionState } from '@/lib/album/firestore'
import { getPipelineById } from '@/lib/pipeline/firestore'
import { needsSubmissionOverwriteConfirm, shouldAutoRateOnLand } from '@/lib/pipeline/rating'
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
import {
  getAvailableActions,
  isEvaluationPipeline,
  resolveAdvanceTarget,
  shouldClearRatingOnUndo,
  shouldRestoreRatingOnLeave,
} from '@/lib/pipeline/workflow'
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

export class SubmissionConfirmRequiredError extends Error {
  constructor(
    readonly albumId: string,
    readonly rating: NonNullable<Awaited<ReturnType<typeof getAlbumById>>>['rating'],
  ) {
    super('Confirm that evaluation may overwrite the current rating on a rated exit')
    this.name = 'SubmissionConfirmRequiredError'
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
  return templateId === 'filter' || templateId === 'evaluation'
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
    throw new WorkflowEligibilityError('This funnel template does not support workflow actions.')
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

async function assertEvaluationSubmissionAllowed(
  uid: string,
  albumId: string,
  pipelineId: string,
  confirmedOverwrite: boolean,
): Promise<NonNullable<Awaited<ReturnType<typeof getAlbumById>>> | null> {
  const album = await getAlbumById(uid, albumId)
  if (!album) return null
  if (album.ratingSubmittedPipelineId === pipelineId) return album

  if (needsSubmissionOverwriteConfirm(album) && !confirmedOverwrite) {
    throw new SubmissionConfirmRequiredError(albumId, album.rating)
  }
  return album
}

async function writeEvaluationSubmission(
  uid: string,
  album: NonNullable<Awaited<ReturnType<typeof getAlbumById>>>,
  pipelineId: string,
): Promise<void> {
  if (album.ratingSubmittedPipelineId === pipelineId) return
  await updateAlbumSubmissionState(uid, album.id, {
    ratingBeforeSubmission: album.rating ?? null,
    ratingSubmittedPipelineId: pipelineId,
  })
}

async function applyOutcomeRatingIfNeeded(uid: string, albumId: string, stage: Stage): Promise<void> {
  if (!shouldAutoRateOnLand(stage)) return
  await updateAlbumRating(uid, albumId, stage.outcomeRating, 'pipeline')
}

async function cleanupRatingAfterLeavingPipeline(
  uid: string,
  albumId: string,
  stageRole: Stage['pipelineRole'],
): Promise<void> {
  const album = await getAlbumById(uid, albumId)
  if (!album) return

  if (shouldRestoreRatingOnLeave(stageRole)) {
    const restored = album.ratingBeforeSubmission ?? null
    await updateAlbumRating(uid, albumId, restored, restored === null ? null : 'manual')
  }

  await updateAlbumSubmissionState(uid, albumId, {
    ratingSubmittedPipelineId: null,
    ratingBeforeSubmission: null,
  })
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

  if (isEvaluationPipeline(graph.stages)) {
    await applyOutcomeRatingIfNeeded(uid, input.albumId, targetStage)
  }
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

  if (shouldClearRatingOnUndo(currentStage, previousStage)) {
    await updateAlbumRating(uid, input.albumId, null, null)
  }
}

export async function handleStagePlaylistAdd(
  uid: string,
  input: {
    playlistId: string
    albumId: string
    confirmedOverwrite?: boolean
    addedAt?: Date
  },
): Promise<void> {
  const context = await loadStageGraphForPlaylist(uid, input.playlistId)
  let albumForSubmission: NonNullable<Awaited<ReturnType<typeof getAlbumById>>> | null = null

  if (context && isSafeWorkflowTemplate(context.graph.pipeline.templateId)) {
    const open = await getOpenMembershipForAlbumPipeline(
      uid,
      input.albumId,
      context.graph.pipeline.id,
    )
    const enteringOrMoving = !open || open.stageId !== context.stage.id

    if (enteringOrMoving && isEvaluationPipeline(context.graph.stages)) {
      albumForSubmission = await assertEvaluationSubmissionAllowed(
        uid,
        input.albumId,
        context.graph.pipeline.id,
        Boolean(input.confirmedOverwrite),
      )
    }
  }

  await addAlbumToPlaylist(uid, input.playlistId, input.albumId, {
    addedAt: input.addedAt,
    repairAddedAt: Boolean(input.addedAt),
  })
  if (!context || !isSafeWorkflowTemplate(context.graph.pipeline.templateId)) return

  const { graph, stage } = context
  const open = await getOpenMembershipForAlbumPipeline(uid, input.albumId, graph.pipeline.id)
  if (open?.stageId === stage.id) return

  if (albumForSubmission) {
    await writeEvaluationSubmission(uid, albumForSubmission, graph.pipeline.id)
  }

  if (open) {
    await closeStageMembership(uid, open.id)
  }

  await openStageMembership(uid, {
    albumId: input.albumId,
    pipelineId: graph.pipeline.id,
    stageId: stage.id,
    pipelineRole: stage.pipelineRole,
    addedAt: input.addedAt,
  })

  if (isEvaluationPipeline(graph.stages)) {
    await applyOutcomeRatingIfNeeded(uid, input.albumId, stage)
  }
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
    if (isEvaluationPipeline(context.graph.stages)) {
      await cleanupRatingAfterLeavingPipeline(uid, input.albumId, open.pipelineRole)
    }
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

  if (!isSafeWorkflowTemplate(context.graph.pipeline.templateId)) {
    return { enabled: false, byAlbumId: new Map() }
  }

  const openMemberships = await listPipelineOpenMemberships(uid, context.graph.pipeline.id)
  const openByAlbumId = new Map(openMemberships.map((membership) => [membership.albumId, membership]))
  const byAlbumId = new Map<string, PlaylistWorkflowRowState>()

  await Promise.all(
    albumIds.map(async (albumId) => {
      const open = openByAlbumId.get(albumId)

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
    byAlbumId,
  }
}

export async function isPlaylistWorkflowEnabled(uid: string, playlistId: string): Promise<boolean> {
  const context = await loadStageGraphForPlaylist(uid, playlistId)
  return Boolean(context)
}

export { isEvaluationPipeline } from '@/lib/pipeline/workflow'
export { deletePipelineCompletely } from '@/lib/pipeline/deletePipeline'
