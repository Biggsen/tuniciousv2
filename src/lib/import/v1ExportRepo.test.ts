import { describe, expect, it } from 'vitest'

import {
  defaultStageIdFromMap,
  stagesFromPlaylistMap,
  type V1RepoPlaylistMap,
} from '@/lib/import/v1ExportRepo'
import { V1_NEW_QUEUED_PLAYLIST_ID } from '@/lib/import/parseV1Export'

const sampleMap: V1RepoPlaylistMap = {
  v1Uid: 'v1',
  group: 'new',
  chain: [
    { v1PlaylistId: V1_NEW_QUEUED_PLAYLIST_ID, inferredName: 'Queued', pipelineRole: 'source' },
    { v1PlaylistId: 'curious-id', inferredName: 'Curious', pipelineRole: 'transient' },
  ],
  stages: {
    [V1_NEW_QUEUED_PLAYLIST_ID]: {
      inferredName: 'Queued',
      v2PlaylistId: 'v2-queued',
      v2StageName: 'Queued',
    },
    'curious-id': {
      inferredName: 'Curious',
      v2PlaylistId: 'v2-curious',
      v2StageName: 'Curious',
    },
  },
}

describe('stagesFromPlaylistMap', () => {
  it('uses chain order and v2 playlist ids from stages', () => {
    const stages = stagesFromPlaylistMap(sampleMap)
    expect(stages.map((s) => s.name)).toEqual(['Queued', 'Curious'])
    expect(stages[0].v2PlaylistId).toBe('v2-queued')
  })
})

describe('defaultStageIdFromMap', () => {
  it('prefers Queued', () => {
    expect(defaultStageIdFromMap(stagesFromPlaylistMap(sampleMap))).toBe(V1_NEW_QUEUED_PLAYLIST_ID)
  })
})
