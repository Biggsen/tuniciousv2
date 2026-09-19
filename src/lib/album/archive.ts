import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

import { isAdminUid } from '@/lib/auth/admin'
import { getFirestoreDb } from '@/lib/firebase'
import type { Album, AlbumDocument } from '@/types/library'

export class AdminRequiredError extends Error {
  constructor() {
    super('Admin access required')
    this.name = 'AdminRequiredError'
  }
}

export interface ArchivedAlbumSummary {
  id: string
  title: string
  artist: string
  albumYear?: string
  releaseMbid: string
  archivedAt: Date
  archivedBy?: string
}

export function isAlbumArchived(album: Pick<Album, 'archivedAt'>): boolean {
  return album.archivedAt != null
}

function assertAdmin(uid: string): void {
  if (!isAdminUid(uid)) {
    throw new AdminRequiredError()
  }
}

function toArchivedSummary(id: string, data: AlbumDocument): ArchivedAlbumSummary {
  return {
    id,
    title: data.title,
    artist: data.artist,
    albumYear: data.albumYear,
    releaseMbid: data.releaseMbid,
    archivedAt: data.archivedAt!.toDate(),
    archivedBy: data.archivedBy,
  }
}

async function syncPickerArchiveState(
  albumId: string,
  patch: { archivedAt: ReturnType<typeof serverTimestamp> } | { archivedAt: ReturnType<typeof deleteField>; archivedBy: ReturnType<typeof deleteField> },
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'album_picker', albumId)
  await setDoc(ref, patch, { merge: true })
}

/** Hide a canonical album from the library and drop playlist/pipeline membership. Admin only. */
export async function archiveAlbum(uid: string, albumId: string): Promise<void> {
  assertAdmin(uid)

  const albumRef = doc(getFirestoreDb(), 'albums', albumId)
  const snapshot = await getDoc(albumRef)
  if (!snapshot.exists()) {
    throw new Error('Album not found')
  }

  const data = snapshot.data() as AlbumDocument
  if (data.archivedAt) return

  await updateDoc(albumRef, {
    archivedAt: serverTimestamp(),
    archivedBy: uid,
  })
  await syncPickerArchiveState(albumId, {
    archivedAt: serverTimestamp(),
  })

  const [{ removeAlbumFromAllUserPlaylists }, { closeAllOpenMembershipsForAlbum }] = await Promise.all([
    import('@/lib/playlist/firestore'),
    import('@/lib/pipeline/stageMembership'),
  ])
  await removeAlbumFromAllUserPlaylists(uid, albumId)
  await closeAllOpenMembershipsForAlbum(uid, albumId)
}

/** Restore a canonical album to the active library. Admin only. */
export async function unarchiveAlbum(uid: string, albumId: string): Promise<void> {
  assertAdmin(uid)

  const albumRef = doc(getFirestoreDb(), 'albums', albumId)
  const snapshot = await getDoc(albumRef)
  if (!snapshot.exists()) {
    throw new Error('Album not found')
  }

  const data = snapshot.data() as AlbumDocument
  if (!data.archivedAt) return

  await updateDoc(albumRef, {
    archivedAt: deleteField(),
    archivedBy: deleteField(),
  })
  await syncPickerArchiveState(albumId, {
    archivedAt: deleteField(),
    archivedBy: deleteField(),
  })
}

/** Restore an archived album when the same release is imported again. */
export async function restoreArchivedAlbum(albumId: string): Promise<void> {
  const albumRef = doc(getFirestoreDb(), 'albums', albumId)
  const snapshot = await getDoc(albumRef)
  if (!snapshot.exists()) return

  const data = snapshot.data() as AlbumDocument
  if (!data.archivedAt) return

  await updateDoc(albumRef, {
    archivedAt: deleteField(),
    archivedBy: deleteField(),
  })
  await syncPickerArchiveState(albumId, {
    archivedAt: deleteField(),
    archivedBy: deleteField(),
  })
}

export async function listArchivedAlbums(): Promise<ArchivedAlbumSummary[]> {
  const snapshot = await getDocs(
    query(collection(getFirestoreDb(), 'albums'), where('archivedAt', '!=', null)),
  )

  return snapshot.docs
    .map((docSnap) => toArchivedSummary(docSnap.id, docSnap.data() as AlbumDocument))
    .sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime())
}
