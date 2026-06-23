import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import type { LastfmConnection, LastfmConnectionDocument } from '@/types/user'

function toLastfmConnection(data: LastfmConnectionDocument): LastfmConnection {
  return {
    sessionKey: data.sessionKey,
    username: data.username,
    connectedAt: data.connectedAt.toDate(),
  }
}

export async function saveLastfmConnection(
  uid: string,
  connection: { sessionKey: string; username: string },
): Promise<LastfmConnection> {
  const ref = doc(getFirestoreDb(), 'users', uid)
  await updateDoc(ref, {
    lastfm: {
      sessionKey: connection.sessionKey,
      username: connection.username,
      connectedAt: serverTimestamp(),
    },
  })

  return {
    sessionKey: connection.sessionKey,
    username: connection.username,
    connectedAt: new Date(),
  }
}

export async function clearLastfmConnection(uid: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid)
  await updateDoc(ref, { lastfm: deleteField() })
}

export function lastfmFromProfile(
  data: { lastfm?: LastfmConnectionDocument } | undefined,
): LastfmConnection | null {
  if (!data?.lastfm?.sessionKey || !data.lastfm.username) return null
  return toLastfmConnection(data.lastfm)
}
