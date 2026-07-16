import { describe, expect, it } from 'vitest'

import {
  listAvailableFunnelGroups,
  loadV1AlbumsFromRepo,
  loadV1PlaylistMap,
  resolveV1UidForV2User,
  stageAlbumsFromRepo,
} from '@/lib/import/v1ExportRepo'
import { V1_NEW_QUEUED_PLAYLIST_ID } from '@/lib/import/parseV1Export'

const V2_UID = 'HLxlL3xwLKMumpHf9FVYMsxNlNw1'
const V1_UID = 'jnWUcCoG7VWK1XyvjoSfCuC6ur72'

describe('v1 export repo (bundled assets)', () => {
  it('resolves uid map and loads new funnel Queued albums', async () => {
    expect(await resolveV1UidForV2User(V2_UID)).toBe(V1_UID)
    expect(await listAvailableFunnelGroups(V1_UID)).toEqual(['known', 'new'])

    const map = await loadV1PlaylistMap(V1_UID, 'new')
    expect(map.stages[V1_NEW_QUEUED_PLAYLIST_ID]?.v2PlaylistId).toBeTruthy()

    const albums = await loadV1AlbumsFromRepo(V1_UID)
    expect(albums.length).toBeGreaterThan(0)

    const { staged, stage } = await stageAlbumsFromRepo({
      v2Uid: V2_UID,
      group: 'new',
      v1PlaylistId: V1_NEW_QUEUED_PLAYLIST_ID,
    })
    expect(stage.name).toBe('Queued')
    expect(staged.length).toBeGreaterThan(0)
    expect(staged.every((album) => album.source === 'v1' && album.tracks.length === 0)).toBe(true)
  })
})
