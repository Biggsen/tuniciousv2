import {
  collection,
  doc,
  deleteField,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

import { buildAlbumFromRelease } from '@/lib/album/buildFromRelease'
import { fetchReleaseCoverUrls } from '@/lib/album/coverArt'
import { findOrCreateArtistsFromCredits } from '@/lib/artist/firestore'
import { ensureArtistImages } from '@/lib/artist/syncImages'
import { getRelease } from '@/lib/musicbrainz/api'
import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import type { Album, AlbumDocument } from '@/types/library'
import type { RatingSource, StarRating } from '@/types/pipeline'

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
  const legacyCover = data.coverUrl
  return {
    id,
    title: data.title,
    artistIds: data.artistIds ?? (data.artistId ? [data.artistId] : []),
    artistId: data.artistId,
    artist: data.artist,
    albumYear: data.albumYear,
    type: data.type,
    releaseMbid: data.releaseMbid,
    coverUrlSmall: data.coverUrlSmall ?? legacyCover,
    coverUrlLarge: data.coverUrlLarge ?? legacyCover,
    tracks: data.tracks,
    youtubePlaylistId: data.youtubePlaylistId,
    youtubePlaylistTitle: data.youtubePlaylistTitle,
    rating: data.rating,
    ratingSource: data.ratingSource,
    ratingSubmittedPipelineId: data.ratingSubmittedPipelineId,
    ratingBeforeSubmission: data.ratingBeforeSubmission,
    ratedAt: data.ratedAt?.toDate(),
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
  const covers = await fetchReleaseCoverUrls(releaseMbid)

  const albumId = crypto.randomUUID()
  const ref = doc(getFirestoreDb(), 'users', uid, 'albums', albumId)

  await setDoc(
    ref,
    omitUndefined({
      id: albumId,
      ...built,
      tracks: built.tracks.map((track) => omitUndefined(track)),
      coverUrlSmall: covers.small,
      coverUrlLarge: covers.large,
      importedAt: serverTimestamp(),
    }),
  )

  const created = await getDoc(ref)
  const album = toAlbum(created.id, created.data() as AlbumDocument)

  try {
    await ensureArtistImages(uid, artists, userAgent)
  } catch {
    // Best-effort — album import already succeeded.
  }

  return album
}

export async function setAlbumYouTubePlaylist(
  uid: string,
  albumId: string,
  playlist: { playlistId: string; title: string },
): Promise<Album> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'albums', albumId)
  await updateDoc(
    ref,
    omitUndefined({
      youtubePlaylistId: playlist.playlistId,
      youtubePlaylistTitle: playlist.title,
    }),
  )

  const updated = await getDoc(ref)
  if (!updated.exists()) {
    throw new Error('Album not found')
  }

  return toAlbum(updated.id, updated.data() as AlbumDocument)
}

export async function updateAlbumRating(
  uid: string,
  albumId: string,
  rating: StarRating | null,
  source: RatingSource | null,
): Promise<Album> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'albums', albumId)

  if (rating === null) {
    await updateDoc(ref, {
      rating: deleteField(),
      ratingSource: deleteField(),
      ratedAt: deleteField(),
    })
  } else {
    await updateDoc(
      ref,
      omitUndefined({
        rating,
        ratingSource: source ?? undefined,
        ratedAt: serverTimestamp(),
      }),
    )
  }

  const updated = await getDoc(ref)
  if (!updated.exists()) {
    throw new Error('Album not found')
  }

  return toAlbum(updated.id, updated.data() as AlbumDocument)
}

export async function updateAlbumSubmissionState(
  uid: string,
  albumId: string,
  updates: {
    ratingSubmittedPipelineId?: string | null
    ratingBeforeSubmission?: StarRating | null
  },
): Promise<Album> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'albums', albumId)
  const payload: Record<string, unknown> = {}

  if (updates.ratingSubmittedPipelineId === null) {
    payload.ratingSubmittedPipelineId = deleteField()
  } else if (updates.ratingSubmittedPipelineId !== undefined) {
    payload.ratingSubmittedPipelineId = updates.ratingSubmittedPipelineId
  }

  if (updates.ratingBeforeSubmission === null) {
    payload.ratingBeforeSubmission = deleteField()
  } else if (updates.ratingBeforeSubmission !== undefined) {
    payload.ratingBeforeSubmission = updates.ratingBeforeSubmission
  }

  await updateDoc(ref, payload)

  const updated = await getDoc(ref)
  if (!updated.exists()) {
    throw new Error('Album not found')
  }

  return toAlbum(updated.id, updated.data() as AlbumDocument)
}
