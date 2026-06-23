import {
  createPlaybackSession,
  createTrackListenRecord,
  endPlaybackSession,
  finalizeTrackListenRecord,
} from '@/lib/sessions/firestore'
import { handleListenFinalized } from '@/lib/lastfm/scrobble'
import type { PlaybackQueueItem } from '@/types/playback'
import type { ListenEndReason } from '@/types/sessions'

interface ActiveListen {
  listenId: string
  sessionId: string
  trackLengthMs: number | undefined
  listenedMs: number
  accumulating: boolean
  lastTickAt: number | null
}

interface ActiveSession {
  sessionId: string
  albumId: string
}

let activeSession: ActiveSession | null = null
let activeListen: ActiveListen | null = null
let activeUid: string | null = null

function flushAccumulatedTime() {
  if (!activeListen?.accumulating || activeListen.lastTickAt === null) return
  activeListen.listenedMs += Date.now() - activeListen.lastTickAt
  activeListen.lastTickAt = Date.now()
}

async function finalizeActiveListen(endReason: ListenEndReason) {
  if (!activeListen || !activeUid) return

  flushAccumulatedTime()

  const { listenId, trackLengthMs, listenedMs } = activeListen
  activeListen = null

  try {
    await finalizeTrackListenRecord(
      activeUid,
      listenId,
      listenedMs,
      trackLengthMs,
      endReason,
    )
    await handleListenFinalized(activeUid, listenId)
  } catch (err) {
    console.error('Failed to finalize listen record', err)
  }
}

async function endActiveSession() {
  if (!activeSession || !activeUid) return

  const { sessionId } = activeSession
  activeSession = null

  try {
    await endPlaybackSession(activeUid, sessionId)
  } catch (err) {
    console.error('Failed to end playback session', err)
  }
}

async function ensureSession(uid: string, item: PlaybackQueueItem) {
  if (activeSession?.albumId === item.albumId) return

  if (activeSession) {
    await endActiveSession()
  }

  const session = await createPlaybackSession(uid, item)
  activeSession = { sessionId: session.id, albumId: item.albumId }
}

async function beginListen(uid: string, item: PlaybackQueueItem, trackLengthMs?: number) {
  if (!item.videoId) return

  await ensureSession(uid, item)

  if (!activeSession) return

  const record = await createTrackListenRecord(
    uid,
    activeSession.sessionId,
    item,
    item.videoId,
    trackLengthMs,
  )

  activeListen = {
    listenId: record.id,
    sessionId: activeSession.sessionId,
    trackLengthMs,
    listenedMs: 0,
    accumulating: false,
    lastTickAt: null,
  }
}

export async function onTrackStart(
  uid: string,
  item: PlaybackQueueItem,
  trackLengthMs?: number,
) {
  activeUid = uid
  await finalizeActiveListen('skipped')
  await beginListen(uid, item, trackLengthMs)
}

export function onPlaying() {
  if (!activeListen) return
  if (!activeListen.accumulating) {
    activeListen.accumulating = true
    activeListen.lastTickAt = Date.now()
  }
}

export function onPaused() {
  if (!activeListen?.accumulating) return
  flushAccumulatedTime()
  activeListen.accumulating = false
  activeListen.lastTickAt = null
}

export function updateTrackLength(trackLengthMs: number | undefined) {
  if (!activeListen || !trackLengthMs) return
  activeListen.trackLengthMs = trackLengthMs
}

export async function onTrackEnd(endReason: ListenEndReason) {
  await finalizeActiveListen(endReason)
}

export async function onPlaybackStop(endReason: ListenEndReason = 'stopped') {
  await finalizeActiveListen(endReason)
  await endActiveSession()
}

export async function resetSessionTracking() {
  activeListen = null
  activeSession = null
  activeUid = null
}

export function hasActiveListen(): boolean {
  return activeListen !== null
}
