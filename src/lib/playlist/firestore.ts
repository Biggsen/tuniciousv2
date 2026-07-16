import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import {
  albumStubFromPickerItem,
  ensureAlbumPickerForAlbumIds,
  getAlbumPickerItemsByIdsForUser,
  getAlbumsByIdsForUser,
  listAlbums,
} from '@/lib/album/firestore'
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
    pipelineId: data.pipelineId,
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

export async function listPlaylistsByPipelineId(
  uid: string,
  pipelineId: string,
): Promise<Playlist[]> {
  const snapshot = await getDocs(
    query(playlistsCollection(uid), where('pipelineId', '==', pipelineId)),
  )
  return snapshot.docs
    .map((docSnap) => toPlaylist(docSnap.id, docSnap.data() as PlaylistDocument))
    .sort((a, b) => a.name.localeCompare(b.name))
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
  pipelineId?: string,
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
      pipelineId,
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

/** Detach playlist from a deleted pipeline; keep albums and memberships. */
export async function clearPlaylistPipelineLink(
  uid: string,
  playlistId: string,
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'playlists', playlistId)
  await updateDoc(ref, {
    pipelineId: deleteField(),
    updatedAt: serverTimestamp(),
  })
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

export async function listPlaylistMemberships(
  uid: string,
  playlistId: string,
): Promise<PlaylistMembership[]> {
  const snapshot = await getDocs(membersCollection(uid, playlistId))
  return snapshot.docs
    .map((docSnap) => toMembership(docSnap.data() as PlaylistMembershipDocument))
    .sort((a, b) => a.position - b.position)
}

/**
 * Lightweight playlist rows from album_picker (track ids only, no titles).
 * Use hydratePlaylistMemberAlbums when tracklists / playback need full docs.
 */
export async function listPlaylistMembers(
  uid: string,
  playlistId: string,
  options: { fullAlbums?: boolean } = {},
): Promise<PlaylistMember[]> {
  const memberships = await listPlaylistMemberships(uid, playlistId)
  if (memberships.length === 0) return []

  const albumIds = memberships.map((membership) => membership.albumId)

  if (options.fullAlbums) {
    const albums = await getAlbumsByIdsForUser(uid, albumIds)
    return memberships
      .map((membership) => {
        const album = albums.get(membership.albumId)
        return album ? { membership, album } : null
      })
      .filter((member): member is PlaylistMember => Boolean(member))
  }

  await ensureAlbumPickerForAlbumIds(uid, albumIds)
  const pickers = await getAlbumPickerItemsByIdsForUser(uid, albumIds)
  return memberships
    .map((membership) => {
      const picker = pickers.get(membership.albumId)
      return picker ? { membership, album: albumStubFromPickerItem(picker) } : null
    })
    .filter((member): member is PlaylistMember => Boolean(member))
}

/** Replace stub albums with full album docs (track titles, etc.). */
export async function hydratePlaylistMemberAlbums(
  uid: string,
  members: PlaylistMember[],
): Promise<PlaylistMember[]> {
  if (members.length === 0) return members
  const albums = await getAlbumsByIdsForUser(
    uid,
    members.map((member) => member.album.id),
  )
  return members.map((member) => {
    const album = albums.get(member.album.id)
    return album ? { ...member, album } : member
  })
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
  options: { addedAt?: Date; repairAddedAt?: boolean } = {},
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'playlists', playlistId, 'members', albumId)
  const existing = await getDoc(ref)

  if (existing.exists()) {
    if (options.repairAddedAt && options.addedAt) {
      await updateDoc(ref, { addedAt: Timestamp.fromDate(options.addedAt) })
      await touchPlaylist(uid, playlistId)
    }
    return
  }

  await setDoc(ref, {
    albumId,
    addedAt: options.addedAt ? Timestamp.fromDate(options.addedAt) : serverTimestamp(),
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
  const memberships = await listPlaylistMemberships(uid, playlistId)
  const index = memberships.findIndex((membership) => membership.albumId === albumId)

  if (index < 0) return

  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= memberships.length) return

  const current = memberships[index]
  const swap = memberships[swapIndex]
  const batch = writeBatch(getFirestoreDb())

  const currentRef = doc(
    getFirestoreDb(),
    'users',
    uid,
    'playlists',
    playlistId,
    'members',
    current.albumId,
  )
  const swapRef = doc(
    getFirestoreDb(),
    'users',
    uid,
    'playlists',
    playlistId,
    'members',
    swap.albumId,
  )

  batch.update(currentRef, { position: swap.position })
  batch.update(swapRef, { position: current.position })

  await batch.commit()
  await touchPlaylist(uid, playlistId)
}

export async function countPlaylistAlbums(uid: string, playlistId: string): Promise<number> {
  const snapshot = await getDocs(membersCollection(uid, playlistId))
  return snapshot.size
}

export interface PlaylistStats {
  albumCount: number
  trackCount: number
}

export async function getPlaylistStatsMap(
  uid: string,
  playlistIds: string[],
): Promise<Map<string, PlaylistStats>> {
  if (playlistIds.length === 0) return new Map()

  const [albums, ...memberSnapshots] = await Promise.all([
    listAlbums(uid),
    ...playlistIds.map((playlistId) => getDocs(membersCollection(uid, playlistId))),
  ])

  const albumById = new Map(albums.map((album) => [album.id, album]))
  const stats = new Map<string, PlaylistStats>()

  for (let index = 0; index < playlistIds.length; index++) {
    const playlistId = playlistIds[index]
    const snapshot = memberSnapshots[index]
    let albumCount = 0
    let trackCount = 0

    for (const docSnap of snapshot.docs) {
      const albumId = (docSnap.data() as PlaylistMembershipDocument).albumId
      const album = albumById.get(albumId)
      if (!album) continue
      albumCount++
      trackCount += album.tracks.length
    }

    stats.set(playlistId, { albumCount, trackCount })
  }

  return stats
}
