import { describe, expect, it } from 'vitest'

import { sortPlaylistsByPipelineStages, sortStagesByFunnelDisplayOrder } from '@/lib/pipeline/funnelDisplay'
import type { Stage } from '@/types/pipeline'
import type { Playlist } from '@/types/library'

function makeStage(overrides: Partial<Stage> & Pick<Stage, 'id' | 'pipelineRole'>): Stage {
  return {
    pipelineId: 'pipeline-1',
    playlistId: `playlist-${overrides.id}`,
    name: overrides.id,
    createdAt: new Date(),
    ...overrides,
  }
}

function makePlaylist(id: string, name: string): Playlist {
  const now = new Date()
  return {
    id,
    name,
    pipelineId: 'pipeline-1',
    createdAt: now,
    updatedAt: now,
  }
}

describe('sortStagesByFunnelDisplayOrder', () => {
  it('orders by stage graph edges, not stage names', () => {
    const stages = [
      makeStage({ id: 'wonderful', pipelineRole: 'terminal' }),
      makeStage({ id: 'queued', pipelineRole: 'source', nextStageId: 'curious' }),
      makeStage({
        id: 'curious',
        pipelineRole: 'transient',
        nextStageId: 'interested',
        terminationStageId: 'sink-1',
      }),
      makeStage({ id: 'sink-1', pipelineRole: 'sink' }),
      makeStage({
        id: 'interested',
        pipelineRole: 'transient',
        nextStageId: 'wonderful',
        terminationStageId: 'sink-2',
      }),
      makeStage({ id: 'sink-2', pipelineRole: 'sink' }),
    ]

    expect(sortStagesByFunnelDisplayOrder(stages).map((stage) => stage.id)).toEqual([
      'queued',
      'curious',
      'sink-1',
      'interested',
      'sink-2',
      'wonderful',
    ])
  })
})

describe('sortPlaylistsByPipelineStages', () => {
  it('keeps graph order when playlist names are renamed', () => {
    const stages = [
      makeStage({ id: 'queued', pipelineRole: 'source', nextStageId: 'curious', playlistId: 'p1' }),
      makeStage({
        id: 'curious',
        pipelineRole: 'transient',
        nextStageId: 'wonderful',
        terminationStageId: 'sink-1',
        playlistId: 'p2',
      }),
      makeStage({ id: 'sink-1', pipelineRole: 'sink', playlistId: 'p3' }),
      makeStage({ id: 'wonderful', pipelineRole: 'terminal', playlistId: 'p4' }),
    ]

    const playlists = [
      makePlaylist('p4', 'New - Wonderful'),
      makePlaylist('p3', 'New - Star'),
      makePlaylist('p2', 'New - Curious'),
      makePlaylist('p1', 'New - Queued'),
    ]

    expect(sortPlaylistsByPipelineStages(stages, playlists).map((playlist) => playlist.id)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
    ])
  })
})
