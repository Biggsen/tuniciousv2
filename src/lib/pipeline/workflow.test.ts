import { describe, expect, it } from 'vitest'

import {
  getAvailableActions,
  isEvaluationPipeline,
  isRatedExitStage,
  resolveAdvanceTarget,
  shouldClearRatingOnUndo,
  shouldRestoreRatingOnLeave,
  shouldRetainRatingOnLeave,
  canUndoLastWorkflowStep,
  validateStageRoleFields,
  WorkflowTransitionError,
} from '@/lib/pipeline/workflow'
import type { Stage, StageMembership } from '@/types/pipeline'

function makeStage(overrides: Partial<Stage> & Pick<Stage, 'id' | 'pipelineRole'>): Stage {
  return {
    pipelineId: 'pipeline-1',
    playlistId: `playlist-${overrides.id}`,
    name: overrides.id,
    createdAt: new Date(),
    ...overrides,
  }
}

function buildEvaluationStages(): Record<string, Stage> {
  const stages: Record<string, Stage> = {
    queued: makeStage({ id: 'queued', pipelineRole: 'source', nextStageId: 'curious' }),
    curious: makeStage({
      id: 'curious',
      pipelineRole: 'transient',
      nextStageId: 'interested',
      terminationStageId: 'sink-1',
    }),
    interested: makeStage({
      id: 'interested',
      pipelineRole: 'transient',
      nextStageId: 'good',
      terminationStageId: 'sink-2',
    }),
    good: makeStage({
      id: 'good',
      pipelineRole: 'transient',
      nextStageId: 'excellent',
      terminationStageId: 'sink-3',
    }),
    excellent: makeStage({
      id: 'excellent',
      pipelineRole: 'transient',
      nextStageId: 'wonderful',
      terminationStageId: 'sink-4',
    }),
    wonderful: makeStage({
      id: 'wonderful',
      pipelineRole: 'terminal',
      outcomeRating: 5,
    }),
    'sink-1': makeStage({ id: 'sink-1', pipelineRole: 'sink', outcomeRating: 1 }),
    'sink-2': makeStage({ id: 'sink-2', pipelineRole: 'sink', outcomeRating: 2 }),
    'sink-3': makeStage({ id: 'sink-3', pipelineRole: 'sink', outcomeRating: 3 }),
    'sink-4': makeStage({ id: 'sink-4', pipelineRole: 'sink', outcomeRating: 4 }),
  }
  return stages
}

describe('isEvaluationPipeline', () => {
  it('detects evaluation pipelines by outcomeRating on any stage', () => {
    const stages = Object.values(buildEvaluationStages())
    expect(isEvaluationPipeline(stages)).toBe(true)
  })

  it('returns false when no stage has outcomeRating', () => {
    const stages = [
      makeStage({ id: 'queued', pipelineRole: 'source', nextStageId: 'curious' }),
      makeStage({
        id: 'curious',
        pipelineRole: 'transient',
        nextStageId: 'interested',
        terminationStageId: 'sink-1',
      }),
    ]
    expect(isEvaluationPipeline(stages)).toBe(false)
  })
})

describe('resolveAdvanceTarget', () => {
  const stages = buildEvaluationStages()

  it('Start from Queued advances to Curious', () => {
    expect(resolveAdvanceTarget(stages.queued, 'start')).toBe('curious')
  })

  it('Yes from Curious advances to Interested', () => {
    expect(resolveAdvanceTarget(stages.curious, 'yes')).toBe('interested')
  })

  it('No from Curious advances to 1★ sink', () => {
    expect(resolveAdvanceTarget(stages.curious, 'no')).toBe('sink-1')
  })

  it('Yes chain from Excellent advances to Wonderful', () => {
    expect(resolveAdvanceTarget(stages.excellent, 'yes')).toBe('wonderful')
  })

  it('rejects Start on transient stages', () => {
    expect(() => resolveAdvanceTarget(stages.curious, 'start')).toThrow(WorkflowTransitionError)
  })

  it('rejects Yes on source stages', () => {
    expect(() => resolveAdvanceTarget(stages.queued, 'yes')).toThrow(WorkflowTransitionError)
  })

  it('rejects actions on sink stages via getAvailableActions', () => {
    expect(getAvailableActions(stages['sink-1'])).toEqual([])
    expect(getAvailableActions(stages.wonderful)).toEqual([])
  })
})

describe('rated exit detection', () => {
  const stages = buildEvaluationStages()

  it('marks sinks and terminal as rated exits', () => {
    expect(isRatedExitStage(stages['sink-1'])).toBe(true)
    expect(isRatedExitStage(stages.wonderful)).toBe(true)
    expect(isRatedExitStage(stages.curious)).toBe(false)
  })
})

describe('leave and undo rating rules', () => {
  const stages = buildEvaluationStages()

  it('restores rating when leaving source or transient', () => {
    expect(shouldRestoreRatingOnLeave('source')).toBe(true)
    expect(shouldRestoreRatingOnLeave('transient')).toBe(true)
    expect(shouldRetainRatingOnLeave('sink')).toBe(true)
    expect(shouldRetainRatingOnLeave('terminal')).toBe(true)
  })

  it('clears rating when undoing out of a rated exit', () => {
    expect(shouldClearRatingOnUndo(stages['sink-1'], stages.curious)).toBe(true)
    expect(shouldClearRatingOnUndo(stages.wonderful, stages.excellent)).toBe(true)
    expect(shouldClearRatingOnUndo(stages.curious, stages.interested)).toBe(false)
  })
})

describe('canUndoLastWorkflowStep', () => {
  it('is true only when previousMembershipId is set', () => {
    const withPrev: StageMembership = {
      id: 'm2',
      albumId: 'a1',
      pipelineId: 'p1',
      stageId: 'curious',
      pipelineRole: 'transient',
      addedAt: new Date(),
      previousMembershipId: 'm1',
    }
    const withoutPrev: StageMembership = { ...withPrev, previousMembershipId: undefined }

    expect(canUndoLastWorkflowStep(withPrev)).toBe(true)
    expect(canUndoLastWorkflowStep(withoutPrev)).toBe(false)
    expect(canUndoLastWorkflowStep(null)).toBe(false)
  })
})

describe('validateStageRoleFields', () => {
  const stages = buildEvaluationStages()

  it('accepts the evaluation template graph', () => {
    for (const stage of Object.values(stages)) {
      expect(validateStageRoleFields(stage)).toBe(true)
    }
  })

  it('rejects source without nextStageId', () => {
    expect(
      validateStageRoleFields({
        pipelineRole: 'source',
        nextStageId: undefined,
        terminationStageId: undefined,
        outcomeRating: undefined,
      }),
    ).toBe(false)
  })
})
