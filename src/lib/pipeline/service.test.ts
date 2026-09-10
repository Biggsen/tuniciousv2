import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyWorkflowAction,
  handleStagePlaylistAdd,
  isSafeWorkflowTemplate,
  listPlaylistWorkflowStates,
  undoLastWorkflowStep,
  WorkflowEligibilityError,
} from '@/lib/pipeline/service'
import type { PipelineGraph, Stage, StageMembership } from '@/types/pipeline'

const mockLoadGraph = vi.fn()
const mockGetStageByPlaylistId = vi.fn()
const mockListStagesByPipeline = vi.fn()
const mockListPlaylistsByPipelineId = vi.fn()
const mockGetOpenMembership = vi.fn()
const mockGetMembershipById = vi.fn()
const mockListOpenMembershipsForPipeline = vi.fn()
const mockOpenMembership = vi.fn()
const mockCloseMembership = vi.fn()
const mockReopenMembership = vi.fn()
const mockAddAlbum = vi.fn()
const mockRemoveAlbum = vi.fn()

vi.mock('@/lib/pipeline/stage', () => ({
  listStagesByPipeline: (...args: unknown[]) => mockListStagesByPipeline(...args),
  getStageByPlaylistId: (...args: unknown[]) => mockGetStageByPlaylistId(...args),
}))

vi.mock('@/lib/pipeline/stageMembership', () => ({
  getOpenMembershipForAlbumPipeline: (...args: unknown[]) => mockGetOpenMembership(...args),
  getStageMembershipById: (...args: unknown[]) => mockGetMembershipById(...args),
  listOpenMembershipsForAlbum: vi.fn(),
  listOpenMembershipsForPipeline: (...args: unknown[]) => mockListOpenMembershipsForPipeline(...args),
  listMembershipHistoryForAlbumPipeline: vi.fn(),
  openStageMembership: (...args: unknown[]) => mockOpenMembership(...args),
  closeStageMembership: (...args: unknown[]) => mockCloseMembership(...args),
  reopenStageMembership: (...args: unknown[]) => mockReopenMembership(...args),
}))

vi.mock('@/lib/playlist/firestore', () => ({
  listPlaylistsByPipelineId: (...args: unknown[]) => mockListPlaylistsByPipelineId(...args),
  addAlbumToPlaylist: (...args: unknown[]) => mockAddAlbum(...args),
  removeAlbumFromPlaylist: (...args: unknown[]) => mockRemoveAlbum(...args),
  listPlaylistMembers: vi.fn(),
}))

vi.mock('@/lib/album/firestore', () => ({
  getAlbumById: vi.fn().mockResolvedValue(null),
  updateAlbumRating: vi.fn().mockResolvedValue(undefined),
  updateAlbumSubmissionState: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/pipeline/firestore', () => ({
  getPipelineById: (...args: unknown[]) => mockLoadGraph(...args),
}))

function makeStage(
  overrides: Partial<Stage> & Pick<Stage, 'id' | 'pipelineRole' | 'playlistId'>,
): Stage {
  return {
    id: overrides.id,
    pipelineId: 'pipe-1',
    playlistId: overrides.playlistId,
    name: overrides.id,
    pipelineRole: overrides.pipelineRole,
    createdAt: new Date(),
    nextStageId: overrides.nextStageId,
    terminationStageId: overrides.terminationStageId,
    outcomeRating: overrides.outcomeRating,
  }
}

function makeMembership(
  overrides: Partial<StageMembership> & Pick<StageMembership, 'id' | 'stageId'>,
): StageMembership {
  return {
    id: overrides.id,
    albumId: overrides.albumId ?? 'album-1',
    pipelineId: overrides.pipelineId ?? 'pipe-1',
    stageId: overrides.stageId,
    pipelineRole: overrides.pipelineRole ?? 'source',
    addedAt: overrides.addedAt ?? new Date(),
    removedAt: overrides.removedAt,
    previousMembershipId: overrides.previousMembershipId,
  }
}

const source = makeStage({
  id: 'inbox',
  pipelineRole: 'source',
  playlistId: 'playlist-inbox',
  nextStageId: 'check',
})
const check = makeStage({
  id: 'check',
  pipelineRole: 'transient',
  playlistId: 'playlist-check',
  nextStageId: 'ready',
  terminationStageId: 'culled',
})
const culled = makeStage({ id: 'culled', pipelineRole: 'sink', playlistId: 'playlist-culled' })
const ready = makeStage({ id: 'ready', pipelineRole: 'terminal', playlistId: 'playlist-ready' })

const graph: PipelineGraph = {
  pipeline: { id: 'pipe-1', name: 'Filter', templateId: 'filter', createdAt: new Date() },
  stages: [source, check, culled, ready],
  playlists: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetStageByPlaylistId.mockResolvedValue(source)
  mockLoadGraph.mockResolvedValue(graph.pipeline)
  mockListStagesByPipeline.mockResolvedValue(graph.stages)
  mockListPlaylistsByPipelineId.mockResolvedValue([])
  mockListOpenMembershipsForPipeline.mockResolvedValue([])
  mockGetOpenMembership.mockResolvedValue(null)
  mockGetMembershipById.mockResolvedValue(null)
  mockOpenMembership.mockResolvedValue(makeMembership({ id: 'm-open', stageId: source.id }))
  mockCloseMembership.mockResolvedValue(undefined)
  mockReopenMembership.mockResolvedValue(undefined)
  mockAddAlbum.mockResolvedValue(undefined)
  mockRemoveAlbum.mockResolvedValue(undefined)
})

describe('isSafeWorkflowTemplate', () => {
  it('enables workflow for filter and evaluation templates', () => {
    expect(isSafeWorkflowTemplate('filter')).toBe(true)
    expect(isSafeWorkflowTemplate('evaluation')).toBe(true)
    expect(isSafeWorkflowTemplate(undefined)).toBe(false)
  })
})

describe('listPlaylistWorkflowStates', () => {
  it('exposes workflow actions on evaluation funnels', async () => {
    mockLoadGraph.mockResolvedValue({
      id: 'pipe-1',
      name: 'Eval',
      templateId: 'evaluation',
      createdAt: new Date(),
    })

    const result = await listPlaylistWorkflowStates('user-1', 'playlist-inbox', ['album-1'])

    expect(result.enabled).toBe(true)
    expect(result.blockedReason).toBeUndefined()
    expect(result.byAlbumId.get('album-1')?.actions).toEqual(['start'])
    expect(result.byAlbumId.get('album-1')?.blockedReason).toBeUndefined()
  })
})

describe('handleStagePlaylistAdd', () => {
  it('opens membership for safe filter funnel add', async () => {
    await handleStagePlaylistAdd('user-1', { playlistId: 'playlist-inbox', albumId: 'album-1' })
    expect(mockAddAlbum).toHaveBeenCalledWith('user-1', 'playlist-inbox', 'album-1', {
      addedAt: undefined,
      repairAddedAt: false,
    })
    expect(mockOpenMembership).toHaveBeenCalled()
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-check', 'album-1')
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-culled', 'album-1')
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-ready', 'album-1')
  })

  it('clears sibling stage playlists when moving an open membership', async () => {
    mockGetStageByPlaylistId.mockResolvedValue(check)
    mockGetOpenMembership.mockResolvedValue(
      makeMembership({ id: 'm1', stageId: source.id, pipelineRole: 'source' }),
    )

    await handleStagePlaylistAdd('user-1', { playlistId: 'playlist-check', albumId: 'album-1' })

    expect(mockAddAlbum).toHaveBeenCalledWith('user-1', 'playlist-check', 'album-1', {
      addedAt: undefined,
      repairAddedAt: false,
    })
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-inbox', 'album-1')
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-culled', 'album-1')
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-ready', 'album-1')
    expect(mockCloseMembership).toHaveBeenCalledWith('user-1', 'm1')
    expect(mockOpenMembership).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ stageId: 'check' }),
    )
  })
})

describe('applyWorkflowAction', () => {
  it('moves from source to next stage and syncs playlists', async () => {
    mockGetOpenMembership.mockResolvedValue(makeMembership({ id: 'm1', stageId: source.id }))

    await applyWorkflowAction('user-1', {
      playlistId: 'playlist-inbox',
      albumId: 'album-1',
      action: 'start',
    })

    expect(mockCloseMembership).toHaveBeenCalledWith('user-1', 'm1')
    expect(mockOpenMembership).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ stageId: 'check', previousMembershipId: 'm1' }),
    )
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-inbox', 'album-1')
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-culled', 'album-1')
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-ready', 'album-1')
    expect(mockAddAlbum).toHaveBeenCalledWith('user-1', 'playlist-check', 'album-1')
  })

  it('heals membership onto the viewed stage and drops sibling playlists', async () => {
    mockGetStageByPlaylistId.mockResolvedValue(check)
    mockGetOpenMembership.mockResolvedValue(makeMembership({ id: 'm1', stageId: source.id }))
    mockOpenMembership.mockResolvedValue(makeMembership({ id: 'm-healed', stageId: check.id }))

    await applyWorkflowAction('user-1', {
      playlistId: 'playlist-check',
      albumId: 'album-1',
      action: 'yes',
    })

    // Heal source → check before advancing check → ready
    expect(mockCloseMembership).toHaveBeenCalledWith('user-1', 'm1')
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-inbox', 'album-1')
    expect(mockOpenMembership).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ stageId: 'ready' }),
    )
    expect(mockAddAlbum).toHaveBeenCalledWith('user-1', 'playlist-ready', 'album-1')
  })

  it('opens membership when starting on an evaluation funnel', async () => {
    mockLoadGraph.mockResolvedValue({
      id: 'pipe-1',
      name: 'Eval',
      templateId: 'evaluation',
      createdAt: new Date(),
    })

    await applyWorkflowAction('user-1', {
      playlistId: 'playlist-inbox',
      albumId: 'album-1',
      action: 'start',
    })

    expect(mockOpenMembership).toHaveBeenCalled()
    expect(mockCloseMembership).toHaveBeenCalledWith('user-1', 'm-open')
  })
})

describe('undoLastWorkflowStep', () => {
  it('reopens the previousMembershipId stage and syncs playlist back', async () => {
    mockGetStageByPlaylistId.mockResolvedValue(check)
    mockGetOpenMembership.mockResolvedValue(
      makeMembership({
        id: 'm2',
        stageId: check.id,
        previousMembershipId: 'm1',
      }),
    )
    mockGetMembershipById.mockResolvedValue(
      makeMembership({ id: 'm1', stageId: source.id, removedAt: new Date() }),
    )

    await undoLastWorkflowStep('user-1', { playlistId: 'playlist-check', albumId: 'album-1' })

    expect(mockGetMembershipById).toHaveBeenCalledWith('user-1', 'm1')
    expect(mockCloseMembership).toHaveBeenCalledWith('user-1', 'm2')
    expect(mockReopenMembership).toHaveBeenCalledWith('user-1', 'm1')
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-check', 'album-1')
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-culled', 'album-1')
    expect(mockRemoveAlbum).toHaveBeenCalledWith('user-1', 'playlist-ready', 'album-1')
    expect(mockAddAlbum).toHaveBeenCalledWith('user-1', 'playlist-inbox', 'album-1')
  })

  it('rejects a second undo when previousMembershipId is missing', async () => {
    mockGetStageByPlaylistId.mockResolvedValue(source)
    mockGetOpenMembership.mockResolvedValue(makeMembership({ id: 'm1', stageId: source.id }))

    await expect(
      undoLastWorkflowStep('user-1', { playlistId: 'playlist-inbox', albumId: 'album-1' }),
    ).rejects.toBeInstanceOf(WorkflowEligibilityError)
    expect(mockReopenMembership).not.toHaveBeenCalled()
  })
})

describe('listPlaylistWorkflowStates undo flag', () => {
  it('exposes canUndo only when open membership has previousMembershipId', async () => {
    mockListOpenMembershipsForPipeline.mockResolvedValue([
      makeMembership({ id: 'm2', stageId: source.id, previousMembershipId: 'm1', albumId: 'album-1' }),
      makeMembership({ id: 'm3', stageId: source.id, albumId: 'album-2' }),
    ])

    const result = await listPlaylistWorkflowStates('user-1', 'playlist-inbox', [
      'album-1',
      'album-2',
    ])

    expect(result.byAlbumId.get('album-1')?.canUndo).toBe(true)
    expect(result.byAlbumId.get('album-2')?.canUndo).toBe(false)
  })
})
