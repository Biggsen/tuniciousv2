import { describe, expect, it } from 'vitest'

import {
  sortPlaylistsByPipelineStages,
  sortPlaylistsForPicker,
  sortPlaylistsForPickerByName,
  sortStagesByFunnelDisplayOrder,
} from '@/lib/pipeline/funnelDisplay'
import type { Pipeline, Stage } from '@/types/pipeline'
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

function makePlaylist(id: string, name: string, pipelineId?: string): Playlist {
  const now = new Date()
  return {
    id,
    name,
    pipelineId,
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
      makePlaylist('p4', 'New - Wonderful', 'pipeline-1'),
      makePlaylist('p3', 'New - Star', 'pipeline-1'),
      makePlaylist('p2', 'New - Curious', 'pipeline-1'),
      makePlaylist('p1', 'New - Queued', 'pipeline-1'),
    ]

    expect(sortPlaylistsByPipelineStages(stages, playlists).map((playlist) => playlist.id)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
    ])
  })
})

describe('sortPlaylistsForPicker', () => {
  it('orders funnels by pipeline name, then stage progression', () => {
    const now = new Date()
    const pipelines: Pipeline[] = [
      { id: 'new', name: 'New', templateId: 'evaluation', createdAt: now },
      { id: 'known', name: 'Known', templateId: 'evaluation', createdAt: now },
    ]
    const stagesByPipelineId = new Map<string, Stage[]>([
      [
        'known',
        [
          makeStage({
            id: 'k-queued',
            pipelineId: 'known',
            pipelineRole: 'source',
            nextStageId: 'k-curious',
            playlistId: 'kp1',
          }),
          makeStage({
            id: 'k-curious',
            pipelineId: 'known',
            pipelineRole: 'transient',
            playlistId: 'kp2',
          }),
        ],
      ],
      [
        'new',
        [
          makeStage({
            id: 'n-queued',
            pipelineId: 'new',
            pipelineRole: 'source',
            nextStageId: 'n-curious',
            playlistId: 'np1',
          }),
          makeStage({
            id: 'n-curious',
            pipelineId: 'new',
            pipelineRole: 'transient',
            playlistId: 'np2',
          }),
        ],
      ],
    ])
    const playlists = [
      makePlaylist('np2', 'New - Curious', 'new'),
      makePlaylist('loose', 'Road trip'),
      makePlaylist('kp2', 'Known - Curious', 'known'),
      makePlaylist('np1', 'New - Queued', 'new'),
      makePlaylist('kp1', 'Known - Queued', 'known'),
    ]

    expect(sortPlaylistsForPicker(pipelines, stagesByPipelineId, playlists).map((p) => p.id)).toEqual([
      'kp1',
      'kp2',
      'np1',
      'np2',
      'loose',
    ])
  })
})

describe('sortPlaylistsForPickerByName', () => {
  it('orders Known/New by funnel progression from playlist names', () => {
    const playlists = [
      makePlaylist('n-int', 'New - Interested'),
      makePlaylist('loose', 'Road trip'),
      makePlaylist('k-1', 'Known - 1★'),
      makePlaylist('n-q', 'New - Queued'),
      makePlaylist('k-c', 'Known - Curious'),
      makePlaylist('k-q', 'Known - Queued'),
      makePlaylist('n-c', 'New - Curious'),
    ]

    expect(sortPlaylistsForPickerByName(playlists).map((p) => p.name)).toEqual([
      'Known - Queued',
      'Known - Curious',
      'Known - 1★',
      'New - Queued',
      'New - Curious',
      'New - Interested',
      'Road trip',
    ])
  })
})
