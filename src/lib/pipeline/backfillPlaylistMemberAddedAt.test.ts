import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListPipelines = vi.fn()
const mockListStages = vi.fn()
const mockListOpen = vi.fn()
const mockGetDoc = vi.fn()
const mockUpdateDoc = vi.fn()
const mockDoc = vi.fn((...segments: string[]) => ({ path: segments.join('/') }))

vi.mock('@/lib/pipeline/firestore', () => ({
  listPipelines: (...args: unknown[]) => mockListPipelines(...args),
}))

vi.mock('@/lib/pipeline/stage', () => ({
  listStagesByPipeline: (...args: unknown[]) => mockListStages(...args),
}))

vi.mock('@/lib/pipeline/stageMembership', () => ({
  listOpenMembershipsForPipeline: (...args: unknown[]) => mockListOpen(...args),
}))

vi.mock('@/lib/firebase', () => ({
  getFirestoreDb: () => ({}),
}))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...(args as string[])),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  Timestamp: {
    fromDate: (date: Date) => ({ __type: 'Timestamp', date }),
  },
}))

import { backfillPlaylistMemberAddedAtFromStages } from '@/lib/pipeline/backfillPlaylistMemberAddedAt'
import type { Stage, StageMembership } from '@/types/pipeline'

function makeStage(overrides: Partial<Stage> & Pick<Stage, 'id' | 'playlistId' | 'name'>): Stage {
  return {
    id: overrides.id,
    pipelineId: overrides.pipelineId ?? 'pipe-1',
    playlistId: overrides.playlistId,
    name: overrides.name,
    pipelineRole: overrides.pipelineRole ?? 'transient',
    createdAt: overrides.createdAt ?? new Date('2026-01-01'),
  }
}

function makeMembership(
  overrides: Partial<StageMembership> & Pick<StageMembership, 'id' | 'albumId' | 'stageId'>,
): StageMembership {
  return {
    id: overrides.id,
    albumId: overrides.albumId,
    pipelineId: overrides.pipelineId ?? 'pipe-1',
    stageId: overrides.stageId,
    pipelineRole: overrides.pipelineRole ?? 'transient',
    addedAt: overrides.addedAt ?? new Date('2012-04-17T10:22:42.000Z'),
    removedAt: overrides.removedAt,
  }
}

describe('backfillPlaylistMemberAddedAtFromStages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListPipelines.mockResolvedValue([{ id: 'pipe-1', name: 'New', createdAt: new Date() }])
    mockListStages.mockResolvedValue([
      makeStage({ id: 'stage-stars', playlistId: 'pl-stars', name: '⭐️⭐️' }),
    ])
  })

  it('copies stage membership addedAt onto playlist members', async () => {
    const addedAt = new Date('2012-04-17T10:22:42.000Z')
    mockListOpen.mockResolvedValue([
      makeMembership({ id: 'm1', albumId: 'album-1', stageId: 'stage-stars', addedAt }),
    ])
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        albumId: 'album-1',
        addedAt: { toDate: () => new Date('2026-07-01T00:00:00.000Z') },
      }),
    })
    mockUpdateDoc.mockResolvedValue(undefined)

    const result = await backfillPlaylistMemberAddedAtFromStages('uid-1')

    expect(result.updated).toBe(1)
    expect(result.skipped).toBe(0)
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
    expect(mockUpdateDoc.mock.calls[0][1]).toEqual({
      addedAt: { __type: 'Timestamp', date: addedAt },
    })
  })

  it('skips when playlist addedAt already matches', async () => {
    const addedAt = new Date('2012-04-17T10:22:42.000Z')
    mockListOpen.mockResolvedValue([
      makeMembership({ id: 'm1', albumId: 'album-1', stageId: 'stage-stars', addedAt }),
    ])
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        albumId: 'album-1',
        addedAt: { toDate: () => new Date(addedAt.getTime()) },
      }),
    })

    const result = await backfillPlaylistMemberAddedAtFromStages('uid-1')

    expect(result.updated).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })

  it('counts missing playlist members', async () => {
    mockListOpen.mockResolvedValue([
      makeMembership({ id: 'm1', albumId: 'album-1', stageId: 'stage-stars' }),
    ])
    mockGetDoc.mockResolvedValue({ exists: () => false })

    const result = await backfillPlaylistMemberAddedAtFromStages('uid-1')

    expect(result.missingMember).toBe(1)
    expect(result.updated).toBe(0)
    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })
})
