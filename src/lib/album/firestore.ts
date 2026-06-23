import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'

import { buildAlbumFromRelease } from '@/lib/album/buildFromRelease'
import { fetchReleaseCoverUrl } from '@/lib/album/coverArt'
import { findOrCreateArtistsFromCredits } from '@/lib/artist/firestore'
import { getRelease } from '@/lib/musicbrainz/api'
import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import type { Album, AlbumDocument } from '@/types/library'

export class AlbumAlreadyImportedError extends Error {
  constructor(readonly albumId: string) {
    super('This release is already in your library')
    this.name = 'AlbumAlreadyImportedError'
  }
}

function albumsCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'albums')
}

function toAlbum(id: string, data: AlbumDocument): Album {
  return {
    id,
    title: data.title,
    artistIds: data.artistIds ?? (data.artistId ? [data.artistId] : []),
    artistId: data.artistId,
    artist: data.artist,
    albumYear: data.albumYear,
    type: data.type,
    releaseMbid: data.releaseMbid,
    coverUrl: data.coverUrl,
    tracks: data.tracks,
    importedAt: data.importedAt.toDate(),
  }
}

export async function findAlbumByReleaseMbid(
  uid: string,
  releaseMbid: string,
): Promise<Album | null> {
  const snapshot = await getDocs(
    query(albumsCollection(uid), where('releaseMbid', '==', releaseMbid)),
  )
  if (snapshot.empty) return null
  const docSnap = snapshot.docs[0]
  return toAlbum(docSnap.id, docSnap.data() as AlbumDocument)
}

export async function getAlbumById(uid: string, albumId: string): Promise<Album | null> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'albums', albumId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return toAlbum(snapshot.id, snapshot.data() as AlbumDocument)
}

export async function listAlbums(uid: string): Promise<Album[]> {
  const snapshot = await getDocs(albumsCollection(uid))
  return snapshot.docs
    .map((docSnap) => toAlbum(docSnap.id, docSnap.data() as AlbumDocument))
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function listAlbumsByArtist(uid: string, artistId: string): Promise<Album[]> {
  const snapshot = await getDocs(
    query(albumsCollection(uid), where('artistIds', 'array-contains', artistId)),
  )
  return snapshot.docs
    .map((docSnap) => toAlbum(docSnap.id, docSnap.data() as AlbumDocument))
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function importReleaseToLibrary(
  uid: string,
  releaseMbid: string,
  userAgent?: string,
): Promise<Album> {
  const existing = await findAlbumByReleaseMbid(uid, releaseMbid)
  if (existing) {
    throw new AlbumAlreadyImportedError(existing.id)
  }

  const release = await getRelease(releaseMbid, userAgent)
  const artists = await findOrCreateArtistsFromCredits(uid, release['artist-credit'])
  const built = buildAlbumFromRelease(release, artists)
  const coverUrl = await fetchReleaseCoverUrl(releaseMbid)

  const albumId = crypto.randomUUID()
  const ref = doc(getFirestoreDb(), 'users', uid, 'albums', albumId)

  await setDoc(
    ref,
    omitUndefined({
      id: albumId,
      ...built,
      tracks: built.tracks.map((track) => omitUndefined(track)),
      coverUrl,
      importedAt: serverTimestamp(),
    }),
  )

  const created = await getDoc(ref)
  return toAlbum(created.id, created.data() as AlbumDocument)
}
