import { beforeEach, describe, expect, it, vi } from 'vitest'

import { backfillRatedExitRatings } from '@/lib/pipeline/backfillRatedExitRatings'
import type { Stage, StageMembership } from '@/types/pipeline'

const mockListPipelines = vi.fn()
const mockListStages = vi.fn()
const mockListOpen = vi.fn()
const mockGetAlbum = vi.fn()
const mockUpdateRating = vi.fn()
const mockUpdateSubmission = vi.fn()

vi.mock('@/lib/pipeline/firestore', () => ({
  listPipelines: (...args: unknown[]) => mockListPipelines(...args),
}))

vi.mock('@/lib/pipeline/stage', () => ({
  listStagesByPipeline: (...args: unknown[]) => mockListStages(...args),
}))

vi.mock('@/lib/pipeline/stageMembership', () => ({
  listOpenMembershipsForPipeline: (...args: unknown[]) => mockListOpen(...args),
}))

vi.mock('@/lib/album/firestore', () => ({
  getAlbumById: (...args: unknown[]) => mockGetAlbum(...args),
  updateAlbumRating: (...args: unknown[]) => mockUpdateRating(...args),
  updateAlbumSubmissionState: (...args: unknown[]) => mockUpdateSubmission(...args),
}))

function makeStage(overrides: Partial<Stage> & Pick<Stage, 'id' | 'pipelineRole'>): Stage {
  return {
    id: overrides.id,
    pipelineId: 'pipe-1',
    playlistId: `pl-${overrides.id}`,
    name: overrides.name ?? overrides.id,
    pipelineRole: overrides.pipelineRole,
    createdAt: new Date(),
    outcomeRating: overrides.outcomeRating,
    nextStageId: overrides.nextStageId,
    terminationStageId: overrides.terminationStageId,
  }
}

function makeMembership(
  overrides: Partial<StageMembership> & Pick<StageMembership, 'id' | 'albumId' | 'stageId'>,
): StageMembership {
  return {
    id: overrides.id,
    albumId: overrides.albumId,
    pipelineId: 'pipe-1',
    stageId: overrides.stageId,
    pipelineRole: overrides.pipelineRole ?? 'sink',
    addedAt: new Date(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListPipelines.mockResolvedValue([
    { id: 'pipe-1', name: 'New', templateId: 'evaluation', createdAt: new Date() },
  ])
  mockListStages.mockResolvedValue([
    makeStage({ id: 'queued', pipelineRole: 'source', nextStageId: 'curious' }),
    makeStage({ id: 'sink-1', pipelineRole: 'sink', name: '1★', outcomeRating: 1 }),
    makeStage({ id: 'wonderful', pipelineRole: 'terminal', name: 'Wonderful', outcomeRating: 5 }),
  ])
  mockUpdateRating.mockResolvedValue(undefined)
  mockUpdateSubmission.mockResolvedValue(undefined)
})

describe('backfillRatedExitRatings', () => {
  it('rates open sink/terminal albums and sets submission', async () => {
    mockListOpen.mockResolvedValue([
      makeMembership({ id: 'm1', albumId: 'a1', stageId: 'sink-1', pipelineRole: 'sink' }),
      makeMembership({ id: 'm2', albumId: 'a2', stageId: 'wonderful', pipelineRole: 'terminal' }),
      makeMembership({ id: 'm3', albumId: 'a3', stageId: 'queued', pipelineRole: 'source' }),
    ])
    mockGetAlbum.mockImplementation(async (_uid: string, albumId: string) => ({
      id: albumId,
      title: albumId,
      artist: 'x',
      artistId: 'art',
      artistIds: ['art'],
      releaseMbid: 'mb',
      tracks: [],
      importedAt: new Date(),
    }))

    const result = await backfillRatedExitRatings('uid-1')

    expect(result.updated).toBe(2)
    expect(mockUpdateRating).toHaveBeenCalledWith('uid-1', 'a1', 1, 'pipeline')
    expect(mockUpdateRating).toHaveBeenCalledWith('uid-1', 'a2', 5, 'pipeline')
    expect(mockUpdateRating).not.toHaveBeenCalledWith('uid-1', 'a3', expect.anything(), expect.anything())
    expect(mockUpdateSubmission).toHaveBeenCalledTimes(2)
  })

  it('skips albums that already match pipeline rating and submission', async () => {
    mockListOpen.mockResolvedValue([
      makeMembership({ id: 'm1', albumId: 'a1', stageId: 'sink-1', pipelineRole: 'sink' }),
    ])
    mockGetAlbum.mockResolvedValue({
      id: 'a1',
      title: 'Done',
      artist: 'x',
      artistId: 'art',
      artistIds: ['art'],
      releaseMbid: 'mb',
      tracks: [],
      importedAt: new Date(),
      rating: 1,
      ratingSource: 'pipeline',
      ratingSubmittedPipelineId: 'pipe-1',
    })

    const result = await backfillRatedExitRatings('uid-1')
    expect(result.skipped).toBe(1)
    expect(result.updated).toBe(0)
    expect(mockUpdateRating).not.toHaveBeenCalled()
  })
})
