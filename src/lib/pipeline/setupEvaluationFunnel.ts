import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import { listPipelines } from '@/lib/pipeline/firestore'
import { getFunnelTemplate } from '@/lib/pipeline/funnelTemplates'
import { loadPipelineGraph } from '@/lib/pipeline/service'
import {
  validateFunnelMappings,
  type FunnelStageMappings,
} from '@/lib/pipeline/validateFunnelMappings'
import {
  formatStagePlaylistName,
  validatePipelineName,
} from '@/lib/pipeline/suggestPlaylist'
import { listPlaylists } from '@/lib/playlist/firestore'
import type { PipelineGraph, PipelineTemplateId } from '@/types/pipeline'

export class FunnelSetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FunnelSetupError'
  }
}

/** @deprecated Prefer FunnelSetupError. */
export class EvaluationFunnelSetupError extends FunnelSetupError {
  constructor(message: string) {
    super(message)
    this.name = 'EvaluationFunnelSetupError'
  }
}

export async function setupFunnel(
  uid: string,
  input: {
    name: string
    templateId: PipelineTemplateId
    mappings: FunnelStageMappings
  },
): Promise<PipelineGraph> {
  const template = getFunnelTemplate(input.templateId)
  const pipelineName = input.name.trim()
  const existingPipelines = await listPipelines(uid)
  const nameError = validatePipelineName(
    pipelineName,
    existingPipelines.map((pipeline) => pipeline.name),
  )
  if (nameError) {
    throw new FunnelSetupError(nameError)
  }

  const playlists = await listPlaylists(uid)
  const validationError = validateFunnelMappings(input.templateId, input.mappings, playlists)
  if (validationError) {
    throw new FunnelSetupError(validationError)
  }

  const pipelineId = crypto.randomUUID()
  const now = serverTimestamp()
  const stageIds = Object.fromEntries(
    template.stages.map((stage) => [stage.key, crypto.randomUUID()]),
  )

  const playlistIds: Record<string, string> = {}

  for (const templateStage of template.stages) {
    const choice = input.mappings[templateStage.key]
    if (choice.mode === 'create') {
      playlistIds[templateStage.key] = crypto.randomUUID()
    } else {
      playlistIds[templateStage.key] = choice.playlistId
    }
  }

  const batch = writeBatch(getFirestoreDb())

  batch.set(doc(getFirestoreDb(), 'users', uid, 'pipelines', pipelineId), {
    id: pipelineId,
    name: pipelineName,
    templateId: input.templateId,
    createdAt: now,
    updatedAt: now,
  })

  for (const templateStage of template.stages) {
    const stageId = stageIds[templateStage.key]
    const playlistId = playlistIds[templateStage.key]
    const choice = input.mappings[templateStage.key]

    if (choice.mode === 'create') {
      batch.set(doc(getFirestoreDb(), 'users', uid, 'playlists', playlistId), {
        id: playlistId,
        name: formatStagePlaylistName(pipelineName, templateStage.name),
        pipelineId,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      batch.update(doc(getFirestoreDb(), 'users', uid, 'playlists', playlistId), {
        pipelineId,
        updatedAt: now,
      })
    }

    batch.set(
      doc(getFirestoreDb(), 'users', uid, 'stages', stageId),
      omitUndefined({
        id: stageId,
        pipelineId,
        playlistId,
        name: templateStage.name,
        pipelineRole: templateStage.pipelineRole,
        nextStageId: templateStage.next ? stageIds[templateStage.next] : undefined,
        terminationStageId: templateStage.termination
          ? stageIds[templateStage.termination]
          : undefined,
        outcomeRating: templateStage.outcomeRating,
        createdAt: now,
      }),
    )
  }

  await batch.commit()

  const pipelineRef = doc(getFirestoreDb(), 'users', uid, 'pipelines', pipelineId)
  const created = await getDoc(pipelineRef)
  if (!created.exists()) {
    throw new FunnelSetupError('Failed to create funnel.')
  }

  const graph = await loadPipelineGraph(uid, pipelineId)
  if (!graph) {
    throw new FunnelSetupError('Failed to load funnel after setup.')
  }

  return graph
}

/** @deprecated Prefer setupFunnel with templateId: 'evaluation'. */
export async function setupEvaluationFunnel(
  uid: string,
  input: {
    name: string
    mappings: FunnelStageMappings
  },
): Promise<PipelineGraph> {
  return setupFunnel(uid, {
    name: input.name,
    templateId: 'evaluation',
    mappings: input.mappings,
  })
}
