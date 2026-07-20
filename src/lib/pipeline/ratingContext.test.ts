import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListPipelines = vi.fn()
const mockListStages = vi.fn()
const mockListOpen = vi.fn()

vi.mock('@/lib/pipeline/firestore', () => ({
  listPipelines: (...args: unknown[]) => mockListPipelines(...args),
}))

vi.mock('@/lib/pipeline/stage', () => ({
  listStagesByPipeline: (...args: unknown[]) => mockListStages(...args),
}))

vi.mock('@/lib/pipeline/stageMembership', () => ({
  listOpenMembershipsForPipeline: (...args: unknown[]) => mockListOpen(...args),
  listOpenMembershipsForAlbum: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/pipeline/workflow', () => ({
  isEvaluationPipeline: (stages: Array<{ outcomeRating?: number }>) =>
    stages.some((stage) => stage.outcomeRating !== undefined),
}))

import { listAlbumEvaluationStageContexts } from '@/lib/pipeline/ratingContext'

describe('listAlbumEvaluationStageContexts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListPipelines.mockResolvedValue([{ id: 'pipe-1', name: 'New', createdAt: new Date() }])
  })

  it('maps open memberships to stage name and role', async () => {
    mockListStages.mockResolvedValue([
      {
        id: 'curious',
        pipelineId: 'pipe-1',
        playlistId: 'pl-curious',
        name: 'Curious',
        pipelineRole: 'transient',
        createdAt: new Date(),
      },
      {
        id: 'sink-2',
        pipelineId: 'pipe-1',
        playlistId: 'pl-2',
        name: '2★',
        pipelineRole: 'sink',
        outcomeRating: 2,
        createdAt: new Date(),
      },
    ])
    mockListOpen.mockResolvedValue([
      {
        id: 'm1',
        albumId: 'album-1',
        pipelineId: 'pipe-1',
        stageId: 'curious',
        pipelineRole: 'transient',
        addedAt: new Date(),
      },
    ])

    const map = await listAlbumEvaluationStageContexts('uid-1')
    expect(map.get('album-1')).toEqual({
      pipelineId: 'pipe-1',
      stageId: 'curious',
      stageName: 'Curious',
      pipelineRole: 'transient',
    })
  })

  it('skips non-evaluation pipelines', async () => {
    mockListStages.mockResolvedValue([
      {
        id: 'inbox',
        pipelineId: 'pipe-1',
        playlistId: 'pl',
        name: 'Inbox',
        pipelineRole: 'source',
        createdAt: new Date(),
      },
    ])
    mockListOpen.mockResolvedValue([])

    const map = await listAlbumEvaluationStageContexts('uid-1')
    expect(map.size).toBe(0)
    expect(mockListOpen).not.toHaveBeenCalled()
  })
})
