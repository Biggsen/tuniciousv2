import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import type { TrackYouTubeMapping, TrackYouTubeMappingDocument } from '@/types/youtube'

const FIRESTORE_IN_QUERY_LIMIT = 30
const FIRESTORE_BATCH_LIMIT = 500

function youtubeMappingsCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'youtube_mappings')
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function toMapping(trackId: string, data: TrackYouTubeMappingDocument): TrackYouTubeMapping {
  return {
    trackId,
    videoId: data.videoId,
    videoTitle: data.videoTitle,
    channelTitle: data.channelTitle,
    channelId: data.channelId,
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
  const uniqueIds = [...new Set(trackIds)]
  if (uniqueIds.length === 0) return map

  const col = youtubeMappingsCollection(uid)

  for (const chunk of chunkArray(uniqueIds, FIRESTORE_IN_QUERY_LIMIT)) {
    const snapshot = await getDocs(query(col, where(documentId(), 'in', chunk)))
    for (const docSnap of snapshot.docs) {
      map.set(docSnap.id, toMapping(docSnap.id, docSnap.data() as TrackYouTubeMappingDocument))
    }
  }

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
      channelId: mapping.channelId,
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
  const uniqueIds = [...new Set(trackIds)]
  if (uniqueIds.length === 0) return

  const db = getFirestoreDb()

  for (const chunk of chunkArray(uniqueIds, FIRESTORE_BATCH_LIMIT)) {
    const batch = writeBatch(db)
    for (const trackId of chunk) {
      batch.delete(doc(db, 'users', uid, 'youtube_mappings', trackId))
    }
    await batch.commit()
  }
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
