import { doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import { listPipelines } from '@/lib/pipeline/firestore'
import { listStagesByPipeline } from '@/lib/pipeline/stage'
import { listOpenMembershipsForPipeline } from '@/lib/pipeline/stageMembership'

export interface BackfillPlaylistAddedAtRow {
  albumId: string
  playlistId: string
  stageName: string
  addedAt: Date
  action: 'updated' | 'skipped' | 'missing-member'
}

export interface BackfillPlaylistAddedAtResult {
  updated: number
  skipped: number
  missingMember: number
  rows: BackfillPlaylistAddedAtRow[]
}

/**
 * Copy open StageMembership.addedAt (from v1 playlistHistory) onto the matching
 * PlaylistMembership for that stage's playlist.
 */
export async function backfillPlaylistMemberAddedAtFromStages(
  uid: string,
): Promise<BackfillPlaylistAddedAtResult> {
  const pipelines = await listPipelines(uid)
  const rows: BackfillPlaylistAddedAtRow[] = []
  let updated = 0
  let skipped = 0
  let missingMember = 0

  for (const pipeline of pipelines) {
    const stages = await listStagesByPipeline(uid, pipeline.id)
    if (stages.length === 0) continue

    const stageById = new Map(stages.map((stage) => [stage.id, stage]))
    const openMemberships = await listOpenMembershipsForPipeline(uid, pipeline.id)

    for (const membership of openMemberships) {
      const stage = stageById.get(membership.stageId)
      if (!stage) {
        skipped++
        continue
      }

      const memberRef = doc(
        getFirestoreDb(),
        'users',
        uid,
        'playlists',
        stage.playlistId,
        'members',
        membership.albumId,
      )
      const memberSnap = await getDoc(memberRef)
      if (!memberSnap.exists()) {
        missingMember++
        rows.push({
          albumId: membership.albumId,
          playlistId: stage.playlistId,
          stageName: stage.name,
          addedAt: membership.addedAt,
          action: 'missing-member',
        })
        continue
      }

      const currentAddedAt = memberSnap.data().addedAt?.toDate?.() as Date | undefined
      if (
        currentAddedAt &&
        Number.isFinite(currentAddedAt.getTime()) &&
        currentAddedAt.getTime() === membership.addedAt.getTime()
      ) {
        skipped++
        rows.push({
          albumId: membership.albumId,
          playlistId: stage.playlistId,
          stageName: stage.name,
          addedAt: membership.addedAt,
          action: 'skipped',
        })
        continue
      }

      await updateDoc(memberRef, {
        addedAt: Timestamp.fromDate(membership.addedAt),
      })
      updated++
      rows.push({
        albumId: membership.albumId,
        playlistId: stage.playlistId,
        stageName: stage.name,
        addedAt: membership.addedAt,
        action: 'updated',
      })
    }
  }

  return { updated, skipped, missingMember, rows }
}
