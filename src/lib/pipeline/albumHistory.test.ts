import { describe, expect, it, vi } from 'vitest'

import { loadAlbumPipelineHistory } from '@/lib/pipeline/albumHistory'
import type { StageMembership } from '@/types/pipeline'

vi.mock('@/lib/pipeline/stageMembership', () => ({
  listMembershipsForAlbum: vi.fn(),
}))

vi.mock('@/lib/pipeline/firestore', () => ({
  getPipelineById: vi.fn(),
}))

vi.mock('@/lib/pipeline/stage', () => ({
  getStageById: vi.fn(),
}))

import { getPipelineById } from '@/lib/pipeline/firestore'
import { listMembershipsForAlbum } from '@/lib/pipeline/stageMembership'
import { getStageById } from '@/lib/pipeline/stage'

describe('loadAlbumPipelineHistory', () => {
  it('groups memberships by pipeline with stage names, oldest first', async () => {
    const memberships: StageMembership[] = [
      {
        id: 'm1',
        albumId: 'alb',
        pipelineId: 'pipe',
        stageId: 's-queued',
        pipelineRole: 'source',
        addedAt: new Date('2026-01-01'),
        removedAt: new Date('2026-02-01'),
      },
      {
        id: 'm2',
        albumId: 'alb',
        pipelineId: 'pipe',
        stageId: 's-curious',
        pipelineRole: 'transient',
        addedAt: new Date('2026-02-01'),
      },
    ]

    vi.mocked(listMembershipsForAlbum).mockResolvedValue(memberships)
    vi.mocked(getPipelineById).mockResolvedValue({
      id: 'pipe',
      name: 'New',
      templateId: 'evaluation',
      createdAt: new Date(),
    })
    vi.mocked(getStageById).mockImplementation(async (_uid, stageId) => {
      if (stageId === 's-queued') {
        return {
          id: 's-queued',
          pipelineId: 'pipe',
          playlistId: 'p1',
          name: 'Queued',
          pipelineRole: 'source',
          createdAt: new Date(),
        }
      }
      return {
        id: 's-curious',
        pipelineId: 'pipe',
        playlistId: 'p2',
        name: 'Curious',
        pipelineRole: 'transient',
        createdAt: new Date(),
      }
    })

    const groups = await loadAlbumPipelineHistory('uid', 'alb')
    expect(groups).toHaveLength(1)
    expect(groups[0].pipelineName).toBe('New')
    expect(groups[0].rows.map((row) => row.stageName)).toEqual(['Queued', 'Curious'])
    expect(groups[0].rows[0].isCurrent).toBe(false)
    expect(groups[0].rows[1].isCurrent).toBe(true)
  })
})
