import {
  parseV1ExportAlbums,
  V1_NEW_QUEUED_PLAYLIST_ID,
  type V1ExportAlbum,
} from '@/lib/import/parseV1Export'
import type { StagedAlbum } from '@/lib/import/types'

export type V1FunnelGroup = 'new' | 'known'

export interface V1RepoPlaylistMapStage {
  inferredName: string
  pipelineRole?: string
  v2StageId?: string | null
  v2PlaylistId?: string | null
  v2StageName?: string
}

export interface V1RepoPlaylistMap {
  v1Uid: string
  v2Uid?: string | null
  v2PipelineId?: string | null
  group: string
  chain?: Array<{
    v1PlaylistId: string
    inferredName: string
    pipelineRole?: string
  }>
  stages: Record<string, V1RepoPlaylistMapStage>
}

export interface V1RepoStageOption {
  v1PlaylistId: string
  name: string
  pipelineRole?: string
  v2PlaylistId: string | null
  v2StageName?: string
}

const uidMapModules = import.meta.glob<{ default: Record<string, string> }>(
  '../../../resources/exports_v1/v1-pipeline-2026-07-10/uid-map.json',
)

const albumModules = import.meta.glob<{ default: V1ExportAlbum[] }>(
  '../../../resources/exports_v1/v1-pipeline-2026-07-10/*/albums.json',
)

const playlistMapModules = import.meta.glob<{ default: V1RepoPlaylistMap }>(
  '../../../resources/exports_v1/v1-pipeline-2026-07-10/*/playlist-id-map-*.json',
)

function pathIncludesUid(modulePath: string, v1Uid: string): boolean {
  return modulePath.includes(`/${v1Uid}/`) || modulePath.includes(`\\${v1Uid}\\`)
}

function pathEndsWithMap(modulePath: string, group: V1FunnelGroup): boolean {
  return (
    modulePath.endsWith(`playlist-id-map-${group}.json`) ||
    modulePath.includes(`playlist-id-map-${group}.json`)
  )
}

export async function loadV1UidMap(): Promise<Record<string, string>> {
  const entry = Object.values(uidMapModules)[0]
  if (!entry) throw new Error('v1 uid-map.json not found in repo export')
  const mod = await entry()
  return mod.default
}

/** Reverse lookup: v2 firebase uid → v1 export uid. */
export async function resolveV1UidForV2User(v2Uid: string): Promise<string | null> {
  const map = await loadV1UidMap()
  for (const [v1Uid, mappedV2] of Object.entries(map)) {
    if (mappedV2 === v2Uid) return v1Uid
  }
  return null
}

export async function listAvailableFunnelGroups(v1Uid: string): Promise<V1FunnelGroup[]> {
  const groups: V1FunnelGroup[] = []
  for (const path of Object.keys(playlistMapModules)) {
    if (!pathIncludesUid(path, v1Uid)) continue
    if (pathEndsWithMap(path, 'new')) groups.push('new')
    if (pathEndsWithMap(path, 'known')) groups.push('known')
  }
  return [...new Set(groups)].sort((a, b) => a.localeCompare(b)) as V1FunnelGroup[]
}

export async function loadV1PlaylistMap(
  v1Uid: string,
  group: V1FunnelGroup,
): Promise<V1RepoPlaylistMap> {
  const match = Object.entries(playlistMapModules).find(
    ([path]) => pathIncludesUid(path, v1Uid) && pathEndsWithMap(path, group),
  )
  if (!match) {
    throw new Error(`No playlist-id-map-${group}.json for v1 user ${v1Uid}`)
  }
  const mod = await match[1]()
  return mod.default
}

export async function loadV1AlbumsFromRepo(v1Uid: string): Promise<V1ExportAlbum[]> {
  const match = Object.entries(albumModules).find(([path]) => pathIncludesUid(path, v1Uid))
  if (!match) {
    throw new Error(`No albums.json for v1 user ${v1Uid}`)
  }
  const mod = await match[1]()
  if (!Array.isArray(mod.default)) {
    throw new Error('v1 albums.json must be a JSON array')
  }
  return mod.default
}

export function stagesFromPlaylistMap(map: V1RepoPlaylistMap): V1RepoStageOption[] {
  if (map.chain?.length) {
    return map.chain.map((entry) => {
      const stage = map.stages[entry.v1PlaylistId]
      return {
        v1PlaylistId: entry.v1PlaylistId,
        name: stage?.v2StageName || stage?.inferredName || entry.inferredName,
        pipelineRole: entry.pipelineRole ?? stage?.pipelineRole,
        v2PlaylistId: stage?.v2PlaylistId ?? null,
        v2StageName: stage?.v2StageName,
      }
    })
  }

  return Object.entries(map.stages).map(([v1PlaylistId, stage]) => ({
    v1PlaylistId,
    name: stage.v2StageName || stage.inferredName,
    pipelineRole: stage.pipelineRole,
    v2PlaylistId: stage.v2PlaylistId ?? null,
    v2StageName: stage.v2StageName,
  }))
}

export function defaultStageIdFromMap(stages: V1RepoStageOption[]): string | null {
  if (!stages.length) return null
  const queued = stages.find(
    (stage) =>
      stage.v1PlaylistId === V1_NEW_QUEUED_PLAYLIST_ID ||
      /^queued$/i.test(stage.name),
  )
  return queued?.v1PlaylistId ?? stages[0].v1PlaylistId
}

export async function stageAlbumsFromRepo(input: {
  v2Uid: string
  group: V1FunnelGroup
  v1PlaylistId: string
}): Promise<{
  staged: StagedAlbum[]
  v1Uid: string
  stage: V1RepoStageOption
  group: V1FunnelGroup
}> {
  const v1Uid = await resolveV1UidForV2User(input.v2Uid)
  if (!v1Uid) {
    throw new Error('No v1 export mapped for this account (check uid-map.json)')
  }

  const [map, albums] = await Promise.all([
    loadV1PlaylistMap(v1Uid, input.group),
    loadV1AlbumsFromRepo(v1Uid),
  ])

  const stages = stagesFromPlaylistMap(map)
  const stage = stages.find((entry) => entry.v1PlaylistId === input.v1PlaylistId)
  if (!stage) {
    throw new Error(`Stage ${input.v1PlaylistId} not in playlist-id-map-${input.group}.json`)
  }

  const staged = parseV1ExportAlbums(albums, input.v1PlaylistId)
  return { staged, v1Uid, stage, group: input.group }
}
