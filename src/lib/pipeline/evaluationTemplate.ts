import type { PipelineRole, StarRating } from '@/types/pipeline'

export type EvaluationStageKey =
  | 'queued'
  | 'curious'
  | 'interested'
  | 'good'
  | 'excellent'
  | 'wonderful'
  | 'sink-1'
  | 'sink-2'
  | 'sink-3'
  | 'sink-4'

export interface EvaluationTemplateStage {
  key: EvaluationStageKey
  name: string
  pipelineRole: PipelineRole
  next?: EvaluationStageKey
  termination?: EvaluationStageKey
  outcomeRating?: StarRating
}

/** Fixed evaluation funnel stages in setup UI order. */
export const EVALUATION_TEMPLATE_STAGES: EvaluationTemplateStage[] = [
  { key: 'queued', name: 'Queued', pipelineRole: 'source', next: 'curious' },
  {
    key: 'curious',
    name: 'Curious',
    pipelineRole: 'transient',
    next: 'interested',
    termination: 'sink-1',
  },
  {
    key: 'interested',
    name: 'Interested',
    pipelineRole: 'transient',
    next: 'good',
    termination: 'sink-2',
  },
  {
    key: 'good',
    name: 'Good',
    pipelineRole: 'transient',
    next: 'excellent',
    termination: 'sink-3',
  },
  {
    key: 'excellent',
    name: 'Excellent',
    pipelineRole: 'transient',
    next: 'wonderful',
    termination: 'sink-4',
  },
  { key: 'wonderful', name: 'Wonderful', pipelineRole: 'terminal', outcomeRating: 5 },
  { key: 'sink-1', name: '1★', pipelineRole: 'sink', outcomeRating: 1 },
  { key: 'sink-2', name: '2★', pipelineRole: 'sink', outcomeRating: 2 },
  { key: 'sink-3', name: '3★', pipelineRole: 'sink', outcomeRating: 3 },
  { key: 'sink-4', name: '4★', pipelineRole: 'sink', outcomeRating: 4 },
]

export const EVALUATION_STAGE_KEYS = EVALUATION_TEMPLATE_STAGES.map((stage) => stage.key)

/** UI order: source, then each transient followed by its No-exit sink, then terminal. */
export function buildEvaluationFunnelDisplayOrder(): EvaluationStageKey[] {
  const source = EVALUATION_TEMPLATE_STAGES.find((stage) => stage.pipelineRole === 'source')
  if (!source) return [...EVALUATION_STAGE_KEYS]

  const order: EvaluationStageKey[] = [source.key]
  let currentKey = source.next

  while (currentKey) {
    const stage = getEvaluationTemplateStage(currentKey)
    order.push(currentKey)
    if (stage.termination) {
      order.push(stage.termination)
    }
    currentKey = stage.next
  }

  return order
}

export const EVALUATION_FUNNEL_DISPLAY_ORDER = buildEvaluationFunnelDisplayOrder()

export function getEvaluationTemplateStage(key: EvaluationStageKey): EvaluationTemplateStage {
  const stage = EVALUATION_TEMPLATE_STAGES.find((item) => item.key === key)
  if (!stage) {
    throw new Error(`Unknown evaluation stage key: ${key}`)
  }
  return stage
}
