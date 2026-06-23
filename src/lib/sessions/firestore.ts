import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import type { PlaybackQueueItem } from '@/types/playback'
import type {
  ListenEndReason,
  PlaybackSession,
  PlaybackSessionDocument,
  TrackListenRecord,
  TrackListenRecordDocument,
  TrackPlayStats,
  TrackPlayStatsDocument,
} from '@/types/sessions'

function playbackSessionsCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'playback_sessions')
}

function trackListensCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'track_listens')
}

function trackStatsDoc(uid: string, trackId: string) {
  return doc(getFirestoreDb(), 'users', uid, 'track_stats', trackId)
}

function toPlaybackSession(id: string, data: PlaybackSessionDocument): PlaybackSession {
  return {
    id,
    albumId: data.albumId,
    albumTitle: data.albumTitle,
    artist: data.artist,
    sourceType: data.sourceType,
    sourcePlaylistId: data.sourcePlaylistId,
    startedAt: data.startedAt.toDate(),
    endedAt: data.endedAt?.toDate(),
  }
}

function toTrackListenRecord(id: string, data: TrackListenRecordDocument): TrackListenRecord {
  return {
    id,
    playbackSessionId: data.playbackSessionId,
    trackId: data.trackId,
    albumId: data.albumId,
    title: data.title,
    artist: data.artist,
    albumTitle: data.albumTitle,
    videoId: data.videoId,
    trackLengthMs: data.trackLengthMs,
    sourcePlaylistId: data.sourcePlaylistId,
    startedAt: data.startedAt.toDate(),
    endedAt: data.endedAt.toDate(),
    listenedMs: data.listenedMs,
    completed: data.completed,
    endReason: data.endReason,
    scrobbled: data.scrobbled,
  }
}

function toTrackPlayStats(trackId: string, data: TrackPlayStatsDocument): TrackPlayStats {
  return {
    trackId,
    playcount: data.playcount,
    lastPlayedAt: data.lastPlayedAt?.toDate(),
    lastSyncedAt: data.lastSyncedAt?.toDate(),
    lastfmPlaycountAtSync: data.lastfmPlaycountAtSync,
  }
}

export function isListenCompleted(
  listenedMs: number,
  trackLengthMs: number | undefined,
  endReason: ListenEndReason,
): boolean {
  if (endReason === 'completed') return true
  if (!trackLengthMs || trackLengthMs <= 0) return false
  return listenedMs >= trackLengthMs * 0.8
}

export async function createPlaybackSession(
  uid: string,
  item: PlaybackQueueItem,
): Promise<PlaybackSession> {
  const id = crypto.randomUUID()
  const ref = doc(getFirestoreDb(), 'users', uid, 'playback_sessions', id)
  const startedAt = serverTimestamp()

  await setDoc(
    ref,
    omitUndefined({
      id,
      albumId: item.albumId,
      albumTitle: item.albumTitle,
      artist: item.artist,
      sourceType: item.sourceType,
      sourcePlaylistId: item.sourcePlaylistId,
      startedAt,
    }),
  )

  const created = await getDoc(ref)
  return toPlaybackSession(created.id, created.data() as PlaybackSessionDocument)
}

export async function endPlaybackSession(uid: string, sessionId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'playback_sessions', sessionId)
  await updateDoc(ref, { endedAt: serverTimestamp() })
}

export async function createTrackListenRecord(
  uid: string,
  sessionId: string,
  item: PlaybackQueueItem,
  videoId: string,
  trackLengthMs?: number,
): Promise<TrackListenRecord> {
  const id = crypto.randomUUID()
  const ref = doc(getFirestoreDb(), 'users', uid, 'track_listens', id)
  const now = serverTimestamp()

  await setDoc(
    ref,
    omitUndefined({
      id,
      playbackSessionId: sessionId,
      trackId: item.trackId,
      albumId: item.albumId,
      title: item.title,
      artist: item.artist,
      albumTitle: item.albumTitle,
      videoId,
      trackLengthMs,
      sourcePlaylistId: item.sourcePlaylistId,
      startedAt: now,
      endedAt: now,
      listenedMs: 0,
      completed: false,
      endReason: 'stopped',
      scrobbled: false,
    }),
  )

  const created = await getDoc(ref)
  return toTrackListenRecord(created.id, created.data() as TrackListenRecordDocument)
}

export async function finalizeTrackListenRecord(
  uid: string,
  listenId: string,
  listenedMs: number,
  trackLengthMs: number | undefined,
  endReason: ListenEndReason,
): Promise<void> {
  const completed = isListenCompleted(listenedMs, trackLengthMs, endReason)
  const ref = doc(getFirestoreDb(), 'users', uid, 'track_listens', listenId)

  await updateDoc(
    ref,
    omitUndefined({
      endedAt: serverTimestamp(),
      listenedMs: Math.max(0, Math.round(listenedMs)),
      completed,
      endReason,
    }),
  )

  if (completed) {
    const snapshot = await getDoc(ref)
    if (!snapshot.exists()) return
    const data = snapshot.data() as TrackListenRecordDocument
    await incrementTrackPlaycount(uid, data.trackId)
  }
}

async function incrementTrackPlaycount(uid: string, trackId: string): Promise<void> {
  const ref = trackStatsDoc(uid, trackId)
  await setDoc(
    ref,
    {
      trackId,
      playcount: increment(1),
      lastPlayedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function listRecentTrackListens(
  uid: string,
  maxResults = 50,
): Promise<TrackListenRecord[]> {
  const q = query(trackListensCollection(uid), orderBy('startedAt', 'desc'), limit(maxResults))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((docSnap) =>
    toTrackListenRecord(docSnap.id, docSnap.data() as TrackListenRecordDocument),
  )
}

export async function listRecentPlaybackSessions(
  uid: string,
  maxResults = 20,
): Promise<PlaybackSession[]> {
  const q = query(
    playbackSessionsCollection(uid),
    orderBy('startedAt', 'desc'),
    limit(maxResults),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((docSnap) =>
    toPlaybackSession(docSnap.id, docSnap.data() as PlaybackSessionDocument),
  )
}

export async function getTrackPlayStats(
  uid: string,
  trackId: string,
): Promise<TrackPlayStats | null> {
  const snapshot = await getDoc(trackStatsDoc(uid, trackId))
  if (!snapshot.exists()) return null
  return toTrackPlayStats(trackId, snapshot.data() as TrackPlayStatsDocument)
}