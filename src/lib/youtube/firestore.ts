import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import type { TrackYouTubeMapping, TrackYouTubeMappingDocument } from '@/types/youtube'

function toMapping(trackId: string, data: TrackYouTubeMappingDocument): TrackYouTubeMapping {
  return {
    trackId,
    videoId: data.videoId,
    videoTitle: data.videoTitle,
    channelTitle: data.channelTitle,
    durationMs: data.durationMs,
    source: data.source,
    resolvedAt: data.resolvedAt.toDate(),
    searchQuery: data.searchQuery,
  }
}

export async function getTrackMapping(
  uid: string,
  trackId: string,
): Promise<TrackYouTubeMapping | null> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'youtube_mappings', trackId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return toMapping(trackId, snapshot.data() as TrackYouTubeMappingDocument)
}

export async function getMappingsForTrackIds(
  uid: string,
  trackIds: string[],
): Promise<Map<string, TrackYouTubeMapping>> {
  const map = new Map<string, TrackYouTubeMapping>()

  await Promise.all(
    trackIds.map(async (trackId) => {
      const mapping = await getTrackMapping(uid, trackId)
      if (mapping) {
        map.set(trackId, mapping)
      }
    }),
  )

  return map
}

export async function saveTrackMapping(
  uid: string,
  mapping: Omit<TrackYouTubeMapping, 'resolvedAt'> & { resolvedAt?: Date },
): Promise<TrackYouTubeMapping> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'youtube_mappings', mapping.trackId)

  await setDoc(
    ref,
    omitUndefined({
      trackId: mapping.trackId,
      videoId: mapping.videoId,
      videoTitle: mapping.videoTitle,
      channelTitle: mapping.channelTitle,
      durationMs: mapping.durationMs,
      source: mapping.source,
      searchQuery: mapping.searchQuery,
      resolvedAt: serverTimestamp(),
    }),
  )

  const created = await getDoc(ref)
  const resolvedAt = created.data()?.resolvedAt as Timestamp | undefined

  return {
    ...mapping,
    resolvedAt: resolvedAt?.toDate() ?? new Date(),
  }
}

export async function deleteTrackMapping(uid: string, trackId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'youtube_mappings', trackId)
  await deleteDoc(ref)
}

export async function deleteMappingsForTrackIds(uid: string, trackIds: string[]): Promise<void> {
  await Promise.all(trackIds.map((trackId) => deleteTrackMapping(uid, trackId)))
}

export async function countResolvedTracks(
  uid: string,
  trackIds: string[],
): Promise<{ resolved: number; total: number }> {
  const mappings = await getMappingsForTrackIds(uid, trackIds)
  return {
    resolved: mappings.size,
    total: trackIds.length,
  }
}

export async function listMappingsForAlbumTracks(
  uid: string,
  trackIds: string[],
): Promise<TrackYouTubeMapping[]> {
  const map = await getMappingsForTrackIds(uid, trackIds)
  return trackIds
    .map((trackId) => map.get(trackId))
    .filter((mapping): mapping is TrackYouTubeMapping => Boolean(mapping))
}
