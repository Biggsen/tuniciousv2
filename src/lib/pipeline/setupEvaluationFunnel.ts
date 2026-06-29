import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import { listEvaluationPipelines } from '@/lib/pipeline/firestore'
import {
  EVALUATION_TEMPLATE_STAGES,
  type EvaluationStageKey,
} from '@/lib/pipeline/evaluationTemplate'
import { loadPipelineGraph } from '@/lib/pipeline/service'
import {
  validateEvaluationFunnelMappings,
  type EvaluationFunnelMappings,
} from '@/lib/pipeline/validateFunnelMappings'
import {
  formatStagePlaylistName,
  validatePipelineName,
} from '@/lib/pipeline/suggestPlaylist'
import { listPlaylists } from '@/lib/playlist/firestore'
import type { PipelineGraph } from '@/types/pipeline'

export class EvaluationFunnelSetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvaluationFunnelSetupError'
  }
}

export async function setupEvaluationFunnel(
  uid: string,
  input: {
    name: string
    mappings: EvaluationFunnelMappings
  },
): Promise<PipelineGraph> {
  const pipelineName = input.name.trim()
  const existingPipelines = await listEvaluationPipelines(uid)
  const nameError = validatePipelineName(
    pipelineName,
    existingPipelines.map((pipeline) => pipeline.name),
  )
  if (nameError) {
    throw new EvaluationFunnelSetupError(nameError)
  }

  const playlists = await listPlaylists(uid)
  const validationError = validateEvaluationFunnelMappings(input.mappings, playlists)
  if (validationError) {
    throw new EvaluationFunnelSetupError(validationError)
  }

  const pipelineId = crypto.randomUUID()
  const now = serverTimestamp()
  const stageIds = Object.fromEntries(
    EVALUATION_TEMPLATE_STAGES.map((stage) => [stage.key, crypto.randomUUID()]),
  ) as Record<EvaluationStageKey, string>

  const playlistIds: Record<EvaluationStageKey, string> = {} as Record<
    EvaluationStageKey,
    string
  >

  for (const templateStage of EVALUATION_TEMPLATE_STAGES) {
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
    templateId: 'evaluation',
    createdAt: now,
    updatedAt: now,
  })

  for (const templateStage of EVALUATION_TEMPLATE_STAGES) {
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
    throw new EvaluationFunnelSetupError('Failed to create evaluation funnel.')
  }

  const graph = await loadPipelineGraph(uid, pipelineId)
  if (!graph) {
    throw new EvaluationFunnelSetupError('Failed to load evaluation funnel after setup.')
  }

  return graph
}
