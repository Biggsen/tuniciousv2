import type { PipelineRole, Stage, WorkflowAction } from '@/types/pipeline'

export class WorkflowTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowTransitionError'
  }
}

export function isRatedExitStage(stage: Stage): boolean {
  return stage.outcomeRating !== undefined
}

export function isEvaluationPipeline(stages: Stage[]): boolean {
  return stages.some((stage) => stage.outcomeRating !== undefined)
}

export function getStageById(stages: Stage[], stageId: string): Stage | undefined {
  return stages.find((stage) => stage.id === stageId)
}

export function resolveAdvanceTarget(stage: Stage, action: WorkflowAction): string {
  switch (action) {
    case 'start':
      if (stage.pipelineRole !== 'source') {
        throw new WorkflowTransitionError('Start is only valid on source stages')
      }
      if (!stage.nextStageId) {
        throw new WorkflowTransitionError('Source stage is missing nextStageId')
      }
      return stage.nextStageId

    case 'yes':
      if (stage.pipelineRole !== 'transient') {
        throw new WorkflowTransitionError('Yes is only valid on transient stages')
      }
      if (!stage.nextStageId) {
        throw new WorkflowTransitionError('Transient stage is missing nextStageId')
      }
      return stage.nextStageId

    case 'no':
      if (stage.pipelineRole !== 'transient') {
        throw new WorkflowTransitionError('No is only valid on transient stages')
      }
      if (!stage.terminationStageId) {
        throw new WorkflowTransitionError('Transient stage is missing terminationStageId')
      }
      return stage.terminationStageId

    default: {
      const exhaustive: never = action
      throw new WorkflowTransitionError(`Unknown workflow action: ${exhaustive}`)
    }
  }
}

export function getAvailableActions(stage: Stage): WorkflowAction[] {
  switch (stage.pipelineRole) {
    case 'source':
      return ['start']
    case 'transient':
      return ['yes', 'no']
    case 'sink':
    case 'terminal':
      return []
    default: {
      const exhaustive: never = stage.pipelineRole
      throw new WorkflowTransitionError(`Unknown pipeline role: ${exhaustive}`)
    }
  }
}

export function validateStageRoleFields(stage: Pick<
  Stage,
  'pipelineRole' | 'nextStageId' | 'terminationStageId' | 'outcomeRating'
>): boolean {
  switch (stage.pipelineRole) {
    case 'source':
      return Boolean(stage.nextStageId) && !stage.terminationStageId && !stage.outcomeRating
    case 'transient':
      return Boolean(stage.nextStageId && stage.terminationStageId) && !stage.outcomeRating
    case 'sink':
      return !stage.nextStageId && !stage.terminationStageId
    case 'terminal':
      return !stage.nextStageId && !stage.terminationStageId
    default:
      return false
  }
}

export function shouldClearRatingOnUndo(
  fromStage: Stage,
  toStage: Stage,
): boolean {
  const leavingRatedExit = isRatedExitStage(fromStage)
  const enteringTransientOrSource =
    toStage.pipelineRole === 'transient' || toStage.pipelineRole === 'source'
  return leavingRatedExit && enteringTransientOrSource
}

export function shouldRestoreRatingOnLeave(stageRole: PipelineRole): boolean {
  return stageRole === 'source' || stageRole === 'transient'
}

export function shouldRetainRatingOnLeave(stageRole: PipelineRole): boolean {
  return stageRole === 'sink' || stageRole === 'terminal'
}
