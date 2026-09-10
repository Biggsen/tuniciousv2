import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListPipelines = vi.fn()
const mockListStages = vi.fn()
const mockListOpen = vi.fn()
const mockListMembers = vi.fn()
const mockOpenMembership = vi.fn()
const mockGetAlbum = vi.fn()
const mockUpdateSubmission = vi.fn()

vi.mock('@/lib/pipeline/firestore', () => ({
  listPipelines: (...args: unknown[]) => mockListPipelines(...args),
}))

vi.mock('@/lib/pipeline/stage', () => ({
  listStagesByPipeline: (...args: unknown[]) => mockListStages(...args),
}))

vi.mock('@/lib/pipeline/stageMembership', () => ({
  listOpenMembershipsForPipeline: (...args: unknown[]) => mockListOpen(...args),
  openStageMembership: (...args: unknown[]) => mockOpenMembership(...args),
}))

vi.mock('@/lib/playlist/firestore', () => ({
  listPlaylistMemberships: (...args: unknown[]) => mockListMembers(...args),
}))

vi.mock('@/lib/album/firestore', () => ({
  getAlbumById: (...args: unknown[]) => mockGetAlbum(...args),
  updateAlbumSubmissionState: (...args: unknown[]) => mockUpdateSubmission(...args),
}))

vi.mock('@/lib/pipeline/service', async () => {
  const workflow = await import('@/lib/pipeline/workflow')
  return {
    isSafeWorkflowTemplate: (templateId: string | undefined) =>
      templateId === 'evaluation' || templateId === 'filter',
    isEvaluationPipeline: workflow.isEvaluationPipeline,
  }
})

import { backfillMissingStageMemberships } from '@/lib/pipeline/backfillMissingStageMemberships'

describe('backfillMissingStageMemberships', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListPipelines.mockResolvedValue([
      { id: 'pipe-1', name: 'New', templateId: 'evaluation', createdAt: new Date() },
    ])
    mockListStages.mockResolvedValue([
      {
        id: 'queued',
        pipelineId: 'pipe-1',
        playlistId: 'pl-queued',
        name: 'Queued',
        pipelineRole: 'source',
        createdAt: new Date(),
      },
      {
        id: 'sink-1',
        pipelineId: 'pipe-1',
        playlistId: 'pl-sink',
        name: '1★',
        pipelineRole: 'sink',
        outcomeRating: 1,
        createdAt: new Date(),
      },
    ])
    mockListOpen.mockResolvedValue([])
    mockOpenMembership.mockResolvedValue({})
    mockGetAlbum.mockResolvedValue({ id: 'album-missing', rating: null })
    mockUpdateSubmission.mockResolvedValue(undefined)
  })

  it('creates stage membership for playlist members without one', async () => {
    const addedAt = new Date('2012-04-17T10:22:42.000Z')
    mockListMembers.mockImplementation(async (_uid: string, playlistId: string) => {
      if (playlistId === 'pl-queued') {
        return [{ albumId: 'album-missing', addedAt, position: 0 }]
      }
      return []
    })

    const result = await backfillMissingStageMemberships('uid-1')

    expect(result.created).toBe(1)
    expect(mockOpenMembership).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({
        albumId: 'album-missing',
        stageId: 'queued',
        addedAt,
      }),
    )
    expect(mockUpdateSubmission).toHaveBeenCalledWith(
      'uid-1',
      'album-missing',
      expect.objectContaining({ ratingSubmittedPipelineId: 'pipe-1' }),
    )
  })

  it('skips albums that already have open membership on that stage', async () => {
    mockListOpen.mockResolvedValue([
      {
        id: 'm1',
        albumId: 'album-1',
        pipelineId: 'pipe-1',
        stageId: 'queued',
        pipelineRole: 'source',
        addedAt: new Date(),
      },
    ])
    mockListMembers.mockImplementation(async (_uid: string, playlistId: string) => {
      if (playlistId === 'pl-queued') {
        return [{ albumId: 'album-1', addedAt: new Date(), position: 0 }]
      }
      return []
    })

    const result = await backfillMissingStageMemberships('uid-1')

    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockOpenMembership).not.toHaveBeenCalled()
  })
})
