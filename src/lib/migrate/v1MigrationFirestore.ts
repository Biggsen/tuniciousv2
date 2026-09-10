import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import type {
  V1MigrationAlbum,
  V1MigrationAlbumDocument,
  V1MigrationCounts,
  V1MigrationMeta,
  V1MigrationMetaDocument,
  V1MigrationStatus,
  V1PlaylistIdMap,
} from '@/types/v1Migration'

const BATCH_LIMIT = 400

function albumsCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'v1_migration_albums')
}

function metaRef(uid: string, group?: string) {
  if (group) {
    return doc(getFirestoreDb(), 'users', uid, 'v1_migration', `meta_${group}`)
  }
  return doc(getFirestoreDb(), 'users', uid, 'v1_migration', 'meta')
}

function playlistMapRef(uid: string, group: string) {
  return doc(getFirestoreDb(), 'users', uid, 'v1_migration', `playlist_map_${group}`)
}

function toAlbum(id: string, data: V1MigrationAlbumDocument): V1MigrationAlbum {
  return {
    v1AlbumId: data.v1AlbumId ?? id,
    albumTitle: data.albumTitle ?? '',
    artistName: data.artistName ?? '',
    releaseYear: data.releaseYear,
    albumCover: data.albumCover,
    playlistHistory: data.playlistHistory ?? [],
    extras: data.extras,
    migration: {
      status: data.migration?.status ?? 'pending',
      v2AlbumId: data.migration?.v2AlbumId,
      candidates: data.migration?.candidates,
      note: data.migration?.note,
      warning: data.migration?.warning,
      appliedAt: data.migration?.appliedAt?.toDate(),
      membershipCount: data.migration?.membershipCount,
    },
  }
}

export type V1MigrationGroup = 'new' | 'known'

export async function getV1MigrationMeta(
  uid: string,
  group?: V1MigrationGroup,
): Promise<V1MigrationMeta | null> {
  if (group) {
    const grouped = await getDoc(metaRef(uid, group))
    if (grouped.exists()) {
      const data = grouped.data() as V1MigrationMetaDocument
      return {
        v1Uid: data.v1Uid,
        v2Uid: data.v2Uid,
        group: data.group,
        v2PipelineId: data.v2PipelineId,
        albumCount: data.albumCount,
        uploadedAt: data.uploadedAt.toDate(),
        sourceExport: data.sourceExport,
      }
    }
  }

  const snapshot = await getDoc(metaRef(uid))
  if (!snapshot.exists()) return null
  const data = snapshot.data() as V1MigrationMetaDocument
  if (group && data.group !== group) return null
  return {
    v1Uid: data.v1Uid,
    v2Uid: data.v2Uid,
    group: data.group,
    v2PipelineId: data.v2PipelineId,
    albumCount: data.albumCount,
    uploadedAt: data.uploadedAt.toDate(),
    sourceExport: data.sourceExport,
  }
}

export async function listAvailableV1MigrationGroups(uid: string): Promise<V1MigrationGroup[]> {
  const groups: V1MigrationGroup[] = []
  for (const group of ['new', 'known'] as const) {
    const [mapSnap, metaSnap] = await Promise.all([
      getDoc(playlistMapRef(uid, group)),
      getDoc(metaRef(uid, group)),
    ])
    if (mapSnap.exists() || metaSnap.exists()) groups.push(group)
  }
  if (groups.length) return groups

  const legacy = await getDoc(metaRef(uid))
  if (legacy.exists()) {
    const data = legacy.data() as V1MigrationMetaDocument
    if (data.group === 'new' || data.group === 'known') return [data.group]
  }
  return []
}

export async function saveV1MigrationMeta(
  uid: string,
  meta: Omit<V1MigrationMeta, 'uploadedAt'> & { uploadedAt?: Date },
): Promise<void> {
  const payload = omitUndefined({
    v1Uid: meta.v1Uid,
    v2Uid: meta.v2Uid,
    group: meta.group,
    v2PipelineId: meta.v2PipelineId,
    albumCount: meta.albumCount,
    sourceExport: meta.sourceExport,
    uploadedAt: meta.uploadedAt ? Timestamp.fromDate(meta.uploadedAt) : serverTimestamp(),
  })
  await setDoc(metaRef(uid, meta.group), payload)
  await setDoc(metaRef(uid), payload)
}

export async function getV1PlaylistIdMap(
  uid: string,
  group: string,
): Promise<V1PlaylistIdMap | null> {
  const snapshot = await getDoc(playlistMapRef(uid, group))
  if (!snapshot.exists()) return null
  return snapshot.data() as V1PlaylistIdMap
}

export async function saveV1PlaylistIdMap(
  uid: string,
  map: V1PlaylistIdMap,
): Promise<void> {
  await setDoc(playlistMapRef(uid, map.group), map)
}

export async function listV1MigrationAlbums(uid: string): Promise<V1MigrationAlbum[]> {
  const snapshot = await getDocs(albumsCollection(uid))
  return snapshot.docs
    .map((docSnap) => toAlbum(docSnap.id, docSnap.data() as V1MigrationAlbumDocument))
    .sort((a, b) => {
      const artistCompare = (a.artistName ?? '').localeCompare(b.artistName ?? '')
      if (artistCompare !== 0) return artistCompare
      return (a.albumTitle ?? '').localeCompare(b.albumTitle ?? '')
    })
}

export async function listV1MigrationAlbumsByStatus(
  uid: string,
  status: V1MigrationStatus,
): Promise<V1MigrationAlbum[]> {
  const snapshot = await getDocs(
    query(albumsCollection(uid), where('migration.status', '==', status)),
  )
  return snapshot.docs.map((docSnap) =>
    toAlbum(docSnap.id, docSnap.data() as V1MigrationAlbumDocument),
  )
}

export async function countV1MigrationAlbums(
  albumsOrUid: string | V1MigrationAlbum[],
): Promise<V1MigrationCounts> {
  const albums =
    typeof albumsOrUid === 'string' ? await listV1MigrationAlbums(albumsOrUid) : albumsOrUid
  const counts: V1MigrationCounts = {
    total: albums.length,
    pending: 0,
    suggested: 0,
    mapped: 0,
    applied: 0,
    skipped: 0,
    unmatched: 0,
  }
  for (const album of albums) {
    counts[album.migration.status]++
  }
  return counts
}

export function filterAlbumsForGroup(
  albums: V1MigrationAlbum[],
  group: string,
  playlistMap: V1PlaylistIdMap | null,
): V1MigrationAlbum[] {
  const spotifyIds = new Set(Object.keys(playlistMap?.stages ?? {}))
  return albums.filter((album) => albumBelongsToGroup(album, group, spotifyIds))
}

export async function upsertV1MigrationAlbums(
  uid: string,
  albums: Array<Omit<V1MigrationAlbum, 'migration'> & { migration?: V1MigrationAlbum['migration'] }>,
): Promise<number> {
  let written = 0
  for (let i = 0; i < albums.length; i += BATCH_LIMIT) {
    const chunk = albums.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(getFirestoreDb())
    for (const album of chunk) {
      const ref = doc(albumsCollection(uid), album.v1AlbumId)
      batch.set(
        ref,
        omitUndefined({
          v1AlbumId: album.v1AlbumId,
          albumTitle: album.albumTitle,
          artistName: album.artistName,
          releaseYear: album.releaseYear,
          albumCover: album.albumCover,
          playlistHistory: album.playlistHistory,
          extras: album.extras,
          migration: album.migration ?? { status: 'pending' as const },
        }),
        { merge: true },
      )
      written++
    }
    await batch.commit()
  }
  return written
}

export async function updateV1MigrationAlbumState(
  uid: string,
  v1AlbumId: string,
  migration: V1MigrationAlbum['migration'],
): Promise<void> {
  const ref = doc(albumsCollection(uid), v1AlbumId)
  await setDoc(
    ref,
    {
      migration: omitUndefined({
        status: migration.status,
        v2AlbumId: migration.v2AlbumId,
        candidates: migration.candidates,
        note: migration.note,
        warning: migration.warning,
        membershipCount: migration.membershipCount,
        appliedAt: migration.appliedAt ? Timestamp.fromDate(migration.appliedAt) : undefined,
      }),
    },
    { merge: true },
  )
}

export function albumBelongsToGroup(
  album: Pick<V1MigrationAlbum, 'playlistHistory'>,
  group: string,
  spotifyIdsInGroup: Set<string>,
): boolean {
  return album.playlistHistory.some(
    (entry) => entry.type === group || spotifyIdsInGroup.has(entry.playlistId),
  )
}
