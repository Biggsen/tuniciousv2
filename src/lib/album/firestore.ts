import {
  collection,
  type DocumentData,
  type UpdateData,
  doc,
  deleteField,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  startAt,
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
import type { Album, AlbumDocument, AlbumEntry, AlbumEntryDocument } from '@/types/library'
import type { RatingSource, StarRating } from '@/types/pipeline'

export class AlbumAlreadyImportedError extends Error {
  constructor(readonly albumId: string) {
    super('This release is already in your library')
    this.name = 'AlbumAlreadyImportedError'
  }
}

function albumsCollection(uid: string) {
  void uid
  return collection(getFirestoreDb(), 'albums')
}

function albumPickerCollection(uid: string) {
  void uid
  return collection(getFirestoreDb(), 'album_picker')
}

export interface AlbumPickerItem {
  id: string
  title: string
  artist: string
  albumYear?: string
  coverUrlSmall?: string
  importedAt?: Date
  titleLower: string
  artistLower: string
}

interface AlbumPickerItemDocument {
  id: string
  title: string
  artist: string
  albumYear?: string
  coverUrlSmall?: string
  importedAt?: AlbumDocument['importedAt']
  titleLower: string
  artistLower: string
}

export interface AlbumPickerCursor {
  titleLower: string
  id: string
}

export interface ListAlbumPickerItemsInput {
  search?: string
  limit?: number
  cursor?: AlbumPickerCursor
}

export interface ListAlbumPickerItemsResult {
  items: AlbumPickerItem[]
  nextCursor?: AlbumPickerCursor
}

const ALBUM_PICKER_DEFAULT_LIMIT = 40
const ALBUM_PICKER_WRITE_CHUNK = 40

/** Per-tab: avoid full library sync on every keystroke after first picker open. */
const albumPickerSyncedUids = new Set<string>()

export function normalizeAlbumPickerText(value: string): string {
  return value.trim().toLowerCase()
}

/** Test/helper: clear in-memory picker sync gate. */
export function resetAlbumPickerSyncGateForTests(): void {
  albumPickerSyncedUids.clear()
}

function toAlbumPickerItem(id: string, data: AlbumPickerItemDocument): AlbumPickerItem {
  return {
    id,
    title: data.title,
    artist: data.artist,
    albumYear: data.albumYear,
    coverUrlSmall: data.coverUrlSmall,
    importedAt: data.importedAt?.toDate(),
    titleLower: data.titleLower,
    artistLower: data.artistLower,
  }
}

export function buildAlbumPickerItemFromAlbum(album: Album): Record<string, unknown> {
  return omitUndefined({
    id: album.id,
    title: album.title,
    artist: album.artist,
    albumYear: album.albumYear,
    coverUrlSmall: album.coverUrlSmall,
    importedAt: album.importedAt,
    titleLower: normalizeAlbumPickerText(album.title),
    artistLower: normalizeAlbumPickerText(album.artist),
  })
}

function toAlbumEntry(data: AlbumEntryDocument): AlbumEntry {
  return {
    albumId: data.albumId,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
    excludedTrackIds: data.excludedTrackIds,
    rating: data.rating,
    ratingSource: data.ratingSource,
    ratingSubmittedPipelineId: data.ratingSubmittedPipelineId,
    ratingBeforeSubmission: data.ratingBeforeSubmission,
    ratedAt: data.ratedAt?.toDate(),
  }
}

async function getAlbumEntry(uid: string, albumId: string): Promise<AlbumEntry | null> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'album_entries', albumId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return toAlbumEntry(snapshot.data() as AlbumEntryDocument)
}

export async function ensureAlbumEntry(uid: string, albumId: string): Promise<AlbumEntry> {
  const existing = await getAlbumEntry(uid, albumId)
  if (existing) {
    const ref = doc(getFirestoreDb(), 'users', uid, 'album_entries', albumId)
    await updateDoc(ref, { updatedAt: serverTimestamp() })
    const refreshed = await getAlbumEntry(uid, albumId)
    if (refreshed) return refreshed
  }

  const ref = doc(getFirestoreDb(), 'users', uid, 'album_entries', albumId)
  await setDoc(ref, {
    albumId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  const created = await getAlbumEntry(uid, albumId)
  if (!created) {
    throw new Error('Failed to create album entry')
  }
  return created
}

export function mergeAlbumPickerMatches(
  titleMatches: AlbumPickerItem[],
  artistMatches: AlbumPickerItem[],
  maxItems: number,
): AlbumPickerItem[] {
  const byId = new Map<string, AlbumPickerItem>()
  for (const item of titleMatches) byId.set(item.id, item)
  for (const item of artistMatches) byId.set(item.id, item)

  return [...byId.values()]
    .sort((a, b) => {
      const titleCompare = a.titleLower.localeCompare(b.titleLower)
      if (titleCompare !== 0) return titleCompare
      return a.id.localeCompare(b.id)
    })
    .slice(0, maxItems)
}

export async function upsertAlbumPickerItem(uid: string, album: Album): Promise<void> {
  void uid
  const ref = doc(getFirestoreDb(), 'album_picker', album.id)
  await setDoc(ref, buildAlbumPickerItemFromAlbum(album), { merge: true })
}

/**
 * Upserts any albums missing from album_picker.
 * Partial projections (one Steely Dan yes, the other no) were possible with empty-only backfill.
 */
export async function syncMissingAlbumPickerItems(uid: string): Promise<number> {
  const [sourceSnapshot, pickerSnapshot] = await Promise.all([
    getDocs(albumsCollection(uid)),
    getDocs(albumPickerCollection(uid)),
  ])
  if (sourceSnapshot.empty) return 0

  const existingIds = new Set(pickerSnapshot.docs.map((docSnap) => docSnap.id))
  const missingAlbums = sourceSnapshot.docs
    .map((docSnap) => toAlbum(docSnap.id, docSnap.data() as AlbumDocument))
    .filter((album) => !existingIds.has(album.id))

  for (let index = 0; index < missingAlbums.length; index += ALBUM_PICKER_WRITE_CHUNK) {
    const chunk = missingAlbums.slice(index, index + ALBUM_PICKER_WRITE_CHUNK)
    await Promise.all(chunk.map((album) => upsertAlbumPickerItem(uid, album)))
  }

  return missingAlbums.length
}

async function ensureAlbumPickerSynced(uid: string): Promise<void> {
  if (albumPickerSyncedUids.has(uid)) return
  await syncMissingAlbumPickerItems(uid)
  albumPickerSyncedUids.add(uid)
}

export async function listAlbumPickerItems(
  uid: string,
  input: ListAlbumPickerItemsInput = {},
): Promise<ListAlbumPickerItemsResult> {
  const pageSize = Math.max(1, Math.min(input.limit ?? ALBUM_PICKER_DEFAULT_LIMIT, 100))
  const normalizedSearch = normalizeAlbumPickerText(input.search ?? '')
  const hasSearch = normalizedSearch.length > 0

  // First page / fresh search: heal any albums still missing from the projection.
  if (!input.cursor) {
    await ensureAlbumPickerSynced(uid)
  }

  if (!hasSearch) {
    const constraints = [orderBy('titleLower'), orderBy('id'), limit(pageSize + 1)] as const
    const snapshot = await getDocs(
      input.cursor
        ? query(
            albumPickerCollection(uid),
            ...constraints,
            startAfter(input.cursor.titleLower, input.cursor.id),
          )
        : query(albumPickerCollection(uid), ...constraints),
    )

    const all = snapshot.docs.map((docSnap) =>
      toAlbumPickerItem(docSnap.id, docSnap.data() as AlbumPickerItemDocument),
    )
    const items = all.slice(0, pageSize)
    const last = items.length > 0 ? items[items.length - 1] : undefined
    const nextCursor =
      all.length > pageSize && last ? { titleLower: last.titleLower, id: last.id } : undefined
    return { items, nextCursor }
  }

  const searchUpperBound = `${normalizedSearch}\uf8ff`
  const [titleSnapshot, artistSnapshot] = await Promise.all([
    getDocs(
      query(
        albumPickerCollection(uid),
        orderBy('titleLower'),
        orderBy('id'),
        startAt(normalizedSearch),
        endAt(searchUpperBound),
        limit(pageSize),
      ),
    ),
    getDocs(
      query(
        albumPickerCollection(uid),
        orderBy('artistLower'),
        orderBy('id'),
        startAt(normalizedSearch),
        endAt(searchUpperBound),
        limit(pageSize),
      ),
    ),
  ])

  const titleMatches = titleSnapshot.docs.map((docSnap) =>
    toAlbumPickerItem(docSnap.id, docSnap.data() as AlbumPickerItemDocument),
  )
  const artistMatches = artistSnapshot.docs.map((docSnap) =>
    toAlbumPickerItem(docSnap.id, docSnap.data() as AlbumPickerItemDocument),
  )

  return {
    items: mergeAlbumPickerMatches(titleMatches, artistMatches, pageSize),
  }
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
    importedBy: data.importedBy,
  }
}

export async function findAlbumByReleaseMbid(
  uid: string,
  releaseMbid: string,
): Promise<Album | null> {
  void uid
  const snapshot = await getDocs(
    query(albumsCollection(uid), where('releaseMbid', '==', releaseMbid)),
  )
  if (snapshot.empty) return null
  const docSnap = snapshot.docs[0]
  return toAlbum(docSnap.id, docSnap.data() as AlbumDocument)
}

export async function getAlbumById(uid: string, albumId: string): Promise<Album | null> {
  const ref = doc(getFirestoreDb(), 'albums', albumId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  const album = toAlbum(snapshot.id, snapshot.data() as AlbumDocument)
  const entry = await getAlbumEntry(uid, albumId)
  if (!entry) return album
  return {
    ...album,
    rating: entry.rating,
    ratingSource: entry.ratingSource,
    ratingSubmittedPipelineId: entry.ratingSubmittedPipelineId,
    ratingBeforeSubmission: entry.ratingBeforeSubmission,
    ratedAt: entry.ratedAt,
  }
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
    await ensureAlbumEntry(uid, existing.id)
    throw new AlbumAlreadyImportedError(existing.id)
  }

  const release = await getRelease(releaseMbid, userAgent)
  const artists = await findOrCreateArtistsFromCredits(uid, release['artist-credit'])
  const built = buildAlbumFromRelease(release, artists)
  const covers = await fetchReleaseCoverUrls(releaseMbid)

  const albumId = crypto.randomUUID()
  const ref = doc(getFirestoreDb(), 'albums', albumId)

  await setDoc(
    ref,
    omitUndefined({
      id: albumId,
      ...built,
      tracks: built.tracks.map((track) => omitUndefined(track)),
      coverUrlSmall: covers.small,
      coverUrlLarge: covers.large,
      importedAt: serverTimestamp(),
      importedBy: uid,
    }),
  )

  const created = await getDoc(ref)
  const album = toAlbum(created.id, created.data() as AlbumDocument)
  await ensureAlbumEntry(uid, album.id)
  await upsertAlbumPickerItem(uid, album)

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
  void uid
  const ref = doc(getFirestoreDb(), 'albums', albumId)
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
  const ref = doc(getFirestoreDb(), 'users', uid, 'album_entries', albumId)
  await ensureAlbumEntry(uid, albumId)

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

  const album = await getAlbumById(uid, albumId)
  if (!album) throw new Error('Album not found')
  return album
}

export async function updateAlbumSubmissionState(
  uid: string,
  albumId: string,
  updates: {
    ratingSubmittedPipelineId?: string | null
    ratingBeforeSubmission?: StarRating | null
  },
): Promise<Album> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'album_entries', albumId)
  await ensureAlbumEntry(uid, albumId)
  const payload: UpdateData<DocumentData> = {}

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

  const album = await getAlbumById(uid, albumId)
  if (!album) throw new Error('Album not found')
  return album
}
