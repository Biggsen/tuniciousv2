import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

import { getAlbumById } from '@/lib/album/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import type {
  Playlist,
  PlaylistDocument,
  PlaylistMember,
  PlaylistMembership,
  PlaylistMembershipDocument,
} from '@/types/library'

function playlistsCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'playlists')
}

function membersCollection(uid: string, playlistId: string) {
  return collection(getFirestoreDb(), 'users', uid, 'playlists', playlistId, 'members')
}

function toPlaylist(id: string, data: PlaylistDocument): Playlist {
  return {
    id,
    name: data.name,
    description: data.description,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
  }
}

function toMembership(data: PlaylistMembershipDocument): PlaylistMembership {
  return {
    albumId: data.albumId,
    addedAt: data.addedAt.toDate(),
    position: data.position,
  }
}

export async function listPlaylists(uid: string): Promise<Playlist[]> {
  const snapshot = await getDocs(playlistsCollection(uid))
  return snapshot.docs
    .map((docSnap) => toPlaylist(docSnap.id, docSnap.data() as PlaylistDocument))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

export async function getPlaylistById(uid: string, playlistId: string): Promise<Playlist | null> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'playlists', playlistId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return toPlaylist(snapshot.id, snapshot.data() as PlaylistDocument)
}

export async function createPlaylist(
  uid: string,
  name: string,
  description?: string,
): Promise<Playlist> {
  const id = crypto.randomUUID()
  const ref = doc(getFirestoreDb(), 'users', uid, 'playlists', id)
  const now = serverTimestamp()

  await setDoc(
    ref,
    omitUndefined({
      id,
      name: name.trim(),
      description: description?.trim(),
      createdAt: now,
      updatedAt: now,
    }),
  )

  const created = await getDoc(ref)
  return toPlaylist(created.id, created.data() as PlaylistDocument)
}

export async function updatePlaylist(
  uid: string,
  playlistId: string,
  updates: { name?: string; description?: string },
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'playlists', playlistId)
  await updateDoc(
    ref,
    omitUndefined({
      name: updates.name?.trim(),
      description: updates.description?.trim(),
      updatedAt: serverTimestamp(),
    }),
  )
}

export async function deletePlaylist(uid: string, playlistId: string): Promise<void> {
  const members = await getDocs(membersCollection(uid, playlistId))
  const batch = writeBatch(getFirestoreDb())

  for (const member of members.docs) {
    batch.delete(member.ref)
  }

  batch.delete(doc(getFirestoreDb(), 'users', uid, 'playlists', playlistId))
  await batch.commit()
}

async function touchPlaylist(uid: string, playlistId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'playlists', playlistId)
  await updateDoc(ref, { updatedAt: serverTimestamp() })
}

export async function listPlaylistMembers(
  uid: string,
  playlistId: string,
): Promise<PlaylistMember[]> {
  const snapshot = await getDocs(membersCollection(uid, playlistId))
  const memberships = snapshot.docs
    .map((docSnap) => toMembership(docSnap.data() as PlaylistMembershipDocument))
    .sort((a, b) => a.position - b.position)

  const members: PlaylistMember[] = []

  for (const membership of memberships) {
    const album = await getAlbumById(uid, membership.albumId)
    if (album) {
      members.push({ membership, album })
    }
  }

  return members
}

async function nextMemberPosition(uid: string, playlistId: string): Promise<number> {
  const snapshot = await getDocs(membersCollection(uid, playlistId))
  if (snapshot.empty) return 0

  let max = -1
  for (const docSnap of snapshot.docs) {
    const position = (docSnap.data() as PlaylistMembershipDocument).position
    if (position > max) max = position
  }

  return max + 1
}

export async function addAlbumToPlaylist(
  uid: string,
  playlistId: string,
  albumId: string,
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'playlists', playlistId, 'members', albumId)
  const existing = await getDoc(ref)

  if (existing.exists()) {
    return
  }

  await setDoc(ref, {
    albumId,
    addedAt: serverTimestamp(),
    position: await nextMemberPosition(uid, playlistId),
  })

  await touchPlaylist(uid, playlistId)
}

export async function removeAlbumFromPlaylist(
  uid: string,
  playlistId: string,
  albumId: string,
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'playlists', playlistId, 'members', albumId)
  await deleteDoc(ref)
  await touchPlaylist(uid, playlistId)
}

export async function reorderPlaylistMember(
  uid: string,
  playlistId: string,
  albumId: string,
  direction: 'up' | 'down',
): Promise<void> {
  const members = await listPlaylistMembers(uid, playlistId)
  const index = members.findIndex((member) => member.album.id === albumId)

  if (index < 0) return

  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= members.length) return

  const current = members[index]
  const swap = members[swapIndex]
  const batch = writeBatch(getFirestoreDb())

  const currentRef = doc(
    getFirestoreDb(),
    'users',
    uid,
    'playlists',
    playlistId,
    'members',
    current.album.id,
  )
  const swapRef = doc(
    getFirestoreDb(),
    'users',
    uid,
    'playlists',
    playlistId,
    'members',
    swap.album.id,
  )

  batch.update(currentRef, { position: swap.membership.position })
  batch.update(swapRef, { position: current.membership.position })

  await batch.commit()
  await touchPlaylist(uid, playlistId)
}

export async function countPlaylistAlbums(uid: string, playlistId: string): Promise<number> {
  const snapshot = await getDocs(membersCollection(uid, playlistId))
  return snapshot.size
}
