import {
  buildFunnelDisplayOrder,
  EVALUATION_FUNNEL_TEMPLATE,
  getTemplateStage,
  type FunnelTemplateStage,
} from '@/lib/pipeline/funnelTemplates'

/** @deprecated Prefer FunnelTemplateStage from funnelTemplates. */
export type EvaluationTemplateStage = FunnelTemplateStage

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

export const EVALUATION_TEMPLATE_STAGES = EVALUATION_FUNNEL_TEMPLATE.stages

export const EVALUATION_STAGE_KEYS = EVALUATION_TEMPLATE_STAGES.map((stage) => stage.key)

export function buildEvaluationFunnelDisplayOrder(): EvaluationStageKey[] {
  return buildFunnelDisplayOrder(EVALUATION_TEMPLATE_STAGES) as EvaluationStageKey[]
}

export const EVALUATION_FUNNEL_DISPLAY_ORDER = buildEvaluationFunnelDisplayOrder()

export function getEvaluationTemplateStage(key: EvaluationStageKey): FunnelTemplateStage {
  return getTemplateStage(EVALUATION_FUNNEL_TEMPLATE, key)
}
