import type { PipelineRole, PipelineTemplateId, StarRating } from '@/types/pipeline'

export interface FunnelTemplateStage {
  key: string
  name: string
  pipelineRole: PipelineRole
  next?: string
  termination?: string
  outcomeRating?: StarRating
}

export interface FunnelTemplate {
  id: PipelineTemplateId
  label: string
  description: string
  stages: FunnelTemplateStage[]
}

/** Fixed 10-stage rated evaluation funnel. */
export const EVALUATION_FUNNEL_TEMPLATE: FunnelTemplate = {
  id: 'evaluation',
  label: 'Evaluation',
  description:
    'Full rating ladder: Queued through Wonderful with 1★–4★ sinks. Auto-rates on rated exits.',
  stages: [
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
  ],
}

/**
 * Short unrated triage funnel for initial filtering / testing deletion.
 * Inbox → Check → Ready (Yes); Culled (No). No outcomeRating.
 */
export const FILTER_FUNNEL_TEMPLATE: FunnelTemplate = {
  id: 'filter',
  label: 'Filter',
  description:
    'Light triage: Inbox → Check → Ready, with Culled on No. No star ratings — workflow only.',
  stages: [
    { key: 'inbox', name: 'Inbox', pipelineRole: 'source', next: 'check' },
    {
      key: 'check',
      name: 'Check',
      pipelineRole: 'transient',
      next: 'ready',
      termination: 'culled',
    },
    { key: 'ready', name: 'Ready', pipelineRole: 'terminal' },
    { key: 'culled', name: 'Culled', pipelineRole: 'sink' },
  ],
}

export const FUNNEL_TEMPLATES: FunnelTemplate[] = [
  EVALUATION_FUNNEL_TEMPLATE,
  FILTER_FUNNEL_TEMPLATE,
]

export function getFunnelTemplate(templateId: PipelineTemplateId): FunnelTemplate {
  const template = FUNNEL_TEMPLATES.find((item) => item.id === templateId)
  if (!template) {
    throw new Error(`Unknown funnel template: ${templateId}`)
  }
  return template
}

/** UI order: source, then each transient followed by its No-exit sink, then terminal. */
export function buildFunnelDisplayOrder(stages: FunnelTemplateStage[]): string[] {
  const source = stages.find((stage) => stage.pipelineRole === 'source')
  if (!source) return stages.map((stage) => stage.key)

  const byKey = new Map(stages.map((stage) => [stage.key, stage]))
  const order: string[] = [source.key]
  let currentKey = source.next

  while (currentKey) {
    const stage = byKey.get(currentKey)
    if (!stage) break
    order.push(currentKey)
    if (stage.termination) {
      order.push(stage.termination)
    }
    currentKey = stage.next
  }

  return order
}

export function getTemplateStage(
  template: FunnelTemplate,
  key: string,
): FunnelTemplateStage {
  const stage = template.stages.find((item) => item.key === key)
  if (!stage) {
    throw new Error(`Unknown stage key "${key}" for template ${template.id}`)
  }
  return stage
}
