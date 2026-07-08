import {
  getAlbumById,
  updateAlbumRating,
  updateAlbumSubmissionState,
} from '@/lib/album/firestore'
import { deletePipeline as deletePipelineDoc } from '@/lib/pipeline/firestore'
import { deleteStagesForPipeline } from '@/lib/pipeline/stage'
import {
  closeAllOpenMembershipsForPipeline,
  listOpenMembershipsForPipeline,
} from '@/lib/pipeline/stageMembership'
import { shouldRestoreRatingOnLeave } from '@/lib/pipeline/workflow'
import {
  clearPlaylistPipelineLink,
  deletePlaylist,
  listPlaylistsByPipelineId,
} from '@/lib/playlist/firestore'
import type { StageMembership } from '@/types/pipeline'

export interface DeletePipelineOptions {
  /** When true, delete linked stage playlists (and their memberships). Albums stay in the library. */
  deletePlaylists?: boolean
}

async function cleanupAlbumAfterPipelineDelete(
  uid: string,
  membership: StageMembership,
): Promise<void> {
  const album = await getAlbumById(uid, membership.albumId)
  if (!album) return

  if (shouldRestoreRatingOnLeave(membership.pipelineRole)) {
    const restored = album.ratingBeforeSubmission ?? null
    await updateAlbumRating(
      uid,
      membership.albumId,
      restored,
      restored === null ? null : 'manual',
    )
  }

  await updateAlbumSubmissionState(uid, membership.albumId, {
    ratingSubmittedPipelineId: null,
    ratingBeforeSubmission: null,
  })
}

/**
 * Deletes a pipeline per Iteration 2 §6.6:
 * stages + pipeline go; open stage memberships close; rating cleanup by stage role.
 * By default playlists are kept and only unlinked; optionally delete them too.
 */
export async function deletePipelineCompletely(
  uid: string,
  pipelineId: string,
  options: DeletePipelineOptions = {},
): Promise<void> {
  const openMemberships = await listOpenMembershipsForPipeline(uid, pipelineId)

  for (const membership of openMemberships) {
    await cleanupAlbumAfterPipelineDelete(uid, membership)
  }

  await closeAllOpenMembershipsForPipeline(uid, pipelineId)
  await deleteStagesForPipeline(uid, pipelineId)

  const linkedPlaylists = await listPlaylistsByPipelineId(uid, pipelineId)

  if (options.deletePlaylists) {
    await Promise.all(linkedPlaylists.map((playlist) => deletePlaylist(uid, playlist.id)))
  } else {
    await Promise.all(
      linkedPlaylists.map((playlist) => clearPlaylistPipelineLink(uid, playlist.id)),
    )
  }

  await deletePipelineDoc(uid, pipelineId)
}
