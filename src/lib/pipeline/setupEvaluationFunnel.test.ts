import { describe, expect, it } from 'vitest'

import {
  buildDefaultStageMappings,
  suggestPlaylistForStage,
  validatePipelineName,
} from '@/lib/pipeline/suggestPlaylist'
import {
  buildEvaluationFunnelDisplayOrder,
  EVALUATION_TEMPLATE_STAGES,
} from '@/lib/pipeline/evaluationTemplate'
import { validateEvaluationFunnelMappings } from '@/lib/pipeline/validateFunnelMappings'
import type { Playlist } from '@/types/library'

function makePlaylist(overrides: Partial<Playlist> & Pick<Playlist, 'id' | 'name'>): Playlist {
  const now = new Date()
  return {
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('suggestPlaylistForStage', () => {
  const playlists = [
    makePlaylist({ id: 'p-queued', name: 'Queued' }),
    makePlaylist({ id: 'p-curious', name: 'curious' }),
    makePlaylist({ id: 'p-other', name: 'Road trip' }),
    makePlaylist({ id: 'p-linked', name: 'Wonderful', pipelineId: 'existing-pipeline' }),
  ]

  it('matches stage names case-insensitively when playlist is unlinked', () => {
    expect(suggestPlaylistForStage({ name: 'Curious' }, playlists)?.id).toBe('p-curious')
  })

  it('ignores playlists already linked to a pipeline', () => {
    expect(suggestPlaylistForStage({ name: 'Wonderful' }, playlists)).toBeUndefined()
  })

  it('prefers pipeline-prefixed playlist names when funnel name is set', () => {
    const prefixed = [
      makePlaylist({ id: 'p-known-queued', name: 'Known Artists - Queued' }),
      makePlaylist({ id: 'p-queued', name: 'Queued' }),
    ]
    expect(suggestPlaylistForStage({ name: 'Queued' }, prefixed, 'Known Artists')?.id).toBe(
      'p-known-queued',
    )
  })
})

describe('buildEvaluationFunnelDisplayOrder', () => {
  it('orders stages as source, transient/sink pairs, then terminal', () => {
    expect(buildEvaluationFunnelDisplayOrder()).toEqual([
      'queued',
      'curious',
      'sink-1',
      'interested',
      'sink-2',
      'good',
      'sink-3',
      'excellent',
      'sink-4',
      'wonderful',
    ])
  })
})

describe('validateEvaluationFunnelMappings', () => {
  const playlists = [
    makePlaylist({ id: 'p1', name: 'Queued' }),
    makePlaylist({ id: 'p2', name: 'Curious' }),
    makePlaylist({ id: 'p3', name: 'Linked', pipelineId: 'pipe-1' }),
  ]

  it('rejects duplicate playlist mappings', () => {
    const mappings = Object.fromEntries(
      EVALUATION_TEMPLATE_STAGES.map((stage) => [
        stage.key,
        { mode: 'existing' as const, playlistId: 'p1' },
      ]),
    )

    expect(validateEvaluationFunnelMappings(mappings, playlists)).toMatch(/more than one stage/)
  })

  it('rejects playlists already linked to a pipeline', () => {
    const mappings = Object.fromEntries(
      EVALUATION_TEMPLATE_STAGES.map((stage, index) => [
        stage.key,
        index === 0
          ? { mode: 'existing' as const, playlistId: 'p3' }
          : { mode: 'create' as const },
      ]),
    )

    expect(validateEvaluationFunnelMappings(mappings, playlists)).toMatch(/already linked/)
  })

  it('accepts create-only mappings', () => {
    const mappings = Object.fromEntries(
      EVALUATION_TEMPLATE_STAGES.map((stage) => [stage.key, { mode: 'create' as const }]),
    )

    expect(validateEvaluationFunnelMappings(mappings, playlists)).toBeNull()
  })
})

describe('buildDefaultStageMappings', () => {
  it('auto-suggests matching playlists and create for the rest', () => {
    const playlists = [
      makePlaylist({ id: 'p-queued', name: 'Queued' }),
      makePlaylist({ id: 'p-curious', name: 'Curious' }),
    ]

    const defaults = buildDefaultStageMappings(EVALUATION_TEMPLATE_STAGES, playlists)

    expect(defaults.queued).toBe('p-queued')
    expect(defaults.curious).toBe('p-curious')
    expect(defaults.interested).toBe('create')
  })

  it('uses prefixed names when funnel name is provided', () => {
    const playlists = [
      makePlaylist({ id: 'p-new-queued', name: 'New Artists - Queued' }),
      makePlaylist({ id: 'p-queued', name: 'Queued' }),
    ]

    const defaults = buildDefaultStageMappings(EVALUATION_TEMPLATE_STAGES, playlists, 'New Artists')

    expect(defaults.queued).toBe('p-new-queued')
  })
})

describe('validatePipelineName', () => {
  it('rejects empty and duplicate names', () => {
    expect(validatePipelineName('', ['Known Artists'])).toMatch(/required/)
    expect(validatePipelineName('Known Artists', ['Known Artists'])).toMatch(/already exists/)
    expect(validatePipelineName('New Artists', ['Known Artists'])).toBeNull()
  })
})
