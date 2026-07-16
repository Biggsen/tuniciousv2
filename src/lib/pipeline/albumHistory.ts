import { getPipelineById } from '@/lib/pipeline/firestore'
import { listMembershipsForAlbum } from '@/lib/pipeline/stageMembership'
import { getStageById } from '@/lib/pipeline/stage'
import type { PipelineRole } from '@/types/pipeline'

export interface AlbumStageHistoryRow {
  membershipId: string
  stageId: string
  stageName: string
  pipelineRole: PipelineRole
  addedAt: Date
  removedAt?: Date
  isCurrent: boolean
}

export interface AlbumPipelineHistoryGroup {
  pipelineId: string
  pipelineName: string
  rows: AlbumStageHistoryRow[]
}

export async function loadAlbumPipelineHistory(
  uid: string,
  albumId: string,
): Promise<AlbumPipelineHistoryGroup[]> {
  const memberships = await listMembershipsForAlbum(uid, albumId)
  if (memberships.length === 0) return []

  const byPipeline = new Map<string, typeof memberships>()
  for (const membership of memberships) {
    const list = byPipeline.get(membership.pipelineId) ?? []
    list.push(membership)
    byPipeline.set(membership.pipelineId, list)
  }

  const stageCache = new Map<string, { name: string; pipelineRole: PipelineRole }>()
  const groups: AlbumPipelineHistoryGroup[] = []

  for (const [pipelineId, rows] of byPipeline) {
    const pipeline = await getPipelineById(uid, pipelineId)
    const historyRows: AlbumStageHistoryRow[] = []

    for (const membership of rows) {
      let stage = stageCache.get(membership.stageId)
      if (!stage) {
        const loaded = await getStageById(uid, membership.stageId)
        stage = {
          name: loaded?.name ?? membership.stageId.slice(0, 8),
          pipelineRole: loaded?.pipelineRole ?? membership.pipelineRole,
        }
        stageCache.set(membership.stageId, stage)
      }

      historyRows.push({
        membershipId: membership.id,
        stageId: membership.stageId,
        stageName: stage.name,
        pipelineRole: stage.pipelineRole,
        addedAt: membership.addedAt,
        removedAt: membership.removedAt,
        isCurrent: membership.removedAt === undefined,
      })
    }

    groups.push({
      pipelineId,
      pipelineName: pipeline?.name ?? 'Pipeline',
      rows: historyRows,
    })
  }

  return groups.sort((a, b) => a.pipelineName.localeCompare(b.pipelineName))
}

export function formatStageHistoryDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
