import { doc, Timestamp, writeBatch } from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import {
  getOpenMembershipForAlbumPipeline,
  listMembershipHistoryForAlbumPipeline,
} from '@/lib/pipeline/stageMembership'
import type { PipelineRole } from '@/types/pipeline'
import type {
  V1MigrationAlbum,
  V1PlaylistHistoryEntry,
  V1PlaylistIdMap,
} from '@/types/v1Migration'

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function asPipelineRole(value: string | undefined, fallback: string): PipelineRole {
  if (value === 'source' || value === 'transient' || value === 'terminal' || value === 'sink') {
    return value
  }
  if (
    fallback === 'source' ||
    fallback === 'transient' ||
    fallback === 'terminal' ||
    fallback === 'sink'
  ) {
    return fallback
  }
  return 'transient'
}

export interface ApplyAlbumResult {
  v1AlbumId: string
  ok: boolean
  membershipCount: number
  error?: string
}

function sortHistory(entries: V1PlaylistHistoryEntry[]): V1PlaylistHistoryEntry[] {
  return [...entries].sort((a, b) => {
    const aTime = parseIsoDate(a.addedAt)?.getTime() ?? 0
    const bTime = parseIsoDate(b.addedAt)?.getTime() ?? 0
    return aTime - bTime
  })
}

/** Write closed+open StageMembership rows from v1 playlistHistory. */
export async function applyV1AlbumHistory(input: {
  uid: string
  album: V1MigrationAlbum
  playlistMap: V1PlaylistIdMap
  group: string
}): Promise<ApplyAlbumResult> {
  const { uid, album, playlistMap, group } = input
  const v2AlbumId = album.migration.v2AlbumId
  const pipelineId = playlistMap.v2PipelineId

  if (!v2AlbumId) {
    return { v1AlbumId: album.v1AlbumId, ok: false, membershipCount: 0, error: 'No v2AlbumId' }
  }
  if (!pipelineId) {
    return { v1AlbumId: album.v1AlbumId, ok: false, membershipCount: 0, error: 'No v2PipelineId' }
  }
  if (album.migration.status === 'applied') {
    return { v1AlbumId: album.v1AlbumId, ok: false, membershipCount: 0, error: 'Already applied' }
  }

  const existing = await listMembershipHistoryForAlbumPipeline(uid, v2AlbumId, pipelineId)
  if (existing.length > 0) {
    return {
      v1AlbumId: album.v1AlbumId,
      ok: false,
      membershipCount: 0,
      error: 'Album already has stage_memberships for this pipeline — skip to avoid conflict',
    }
  }

  const open = await getOpenMembershipForAlbumPipeline(uid, v2AlbumId, pipelineId)
  if (open) {
    return {
      v1AlbumId: album.v1AlbumId,
      ok: false,
      membershipCount: 0,
      error: 'Album has an open membership for this pipeline',
    }
  }

  const groupSpotifyIds = new Set(Object.keys(playlistMap.stages))
  const history = sortHistory(album.playlistHistory).filter(
    (entry) => entry.type === group || groupSpotifyIds.has(entry.playlistId),
  )

  if (history.length === 0) {
    return {
      v1AlbumId: album.v1AlbumId,
      ok: false,
      membershipCount: 0,
      error: `No playlistHistory segments for group "${group}"`,
    }
  }

  const rows: Array<{
    id: string
    albumId: string
    pipelineId: string
    stageId: string
    pipelineRole: PipelineRole
    addedAt: Timestamp
    removedAt: Timestamp | null
  }> = []

  for (const entry of history) {
    const stage = playlistMap.stages[entry.playlistId]
    if (!stage?.v2StageId) {
      return {
        v1AlbumId: album.v1AlbumId,
        ok: false,
        membershipCount: 0,
        error: `Unmapped playlistId ${entry.playlistId}`,
      }
    }
    const addedAt = parseIsoDate(entry.addedAt)
    if (!addedAt) {
      return {
        v1AlbumId: album.v1AlbumId,
        ok: false,
        membershipCount: 0,
        error: `Invalid addedAt on playlist ${entry.playlistId}`,
      }
    }
    const removedAt = entry.removedAt == null ? null : parseIsoDate(entry.removedAt)
    if (entry.removedAt != null && !removedAt) {
      return {
        v1AlbumId: album.v1AlbumId,
        ok: false,
        membershipCount: 0,
        error: `Invalid removedAt on playlist ${entry.playlistId}`,
      }
    }

    rows.push({
      id: crypto.randomUUID(),
      albumId: v2AlbumId,
      pipelineId,
      stageId: stage.v2StageId,
      pipelineRole: asPipelineRole(entry.pipelineRole, stage.pipelineRole),
      addedAt: Timestamp.fromDate(addedAt),
      removedAt: removedAt ? Timestamp.fromDate(removedAt) : null,
    })
  }

  const openCount = rows.filter((row) => row.removedAt == null).length
  if (openCount > 1) {
    return {
      v1AlbumId: album.v1AlbumId,
      ok: false,
      membershipCount: 0,
      error: `History has ${openCount} open segments (removedAt null)`,
    }
  }

  const batch = writeBatch(getFirestoreDb())
  for (const row of rows) {
    const ref = doc(getFirestoreDb(), 'users', uid, 'stage_memberships', row.id)
    batch.set(ref, row)
  }
  await batch.commit()

  return {
    v1AlbumId: album.v1AlbumId,
    ok: true,
    membershipCount: rows.length,
  }
}

export async function applyMappedV1Albums(input: {
  uid: string
  albums: V1MigrationAlbum[]
  playlistMap: V1PlaylistIdMap
  group: string
  onProgress?: (done: number, total: number, result: ApplyAlbumResult) => void
}): Promise<ApplyAlbumResult[]> {
  const mapped = input.albums.filter((album) => album.migration.status === 'mapped')
  const results: ApplyAlbumResult[] = []
  let done = 0
  for (const album of mapped) {
    const result = await applyV1AlbumHistory({
      uid: input.uid,
      album,
      playlistMap: input.playlistMap,
      group: input.group,
    })
    results.push(result)
    done++
    input.onProgress?.(done, mapped.length, result)
  }
  return results
}
