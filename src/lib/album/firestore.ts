import {
  collection,
  type DocumentData,
  type UpdateData,
  doc,
  documentId,
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
import { isAlbumArchived, restoreArchivedAlbum } from '@/lib/album/archive'
import {
  applyAlbumEntryOverlay,
  filterTrackIdsByExclusions,
} from '@/lib/album/entryOverlay'
import { fetchReleaseCoverUrls } from '@/lib/album/coverArt'
import { replaceTrackTitle } from '@/lib/album/trackTitle'
import { deleteTrackMapping } from '@/lib/youtube/firestore'
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
  releaseMbid?: string
  importedAt?: Date
  titleLower: string
  artistLower: string
  titleTokens?: string[]
  artistTokens?: string[]
  /** Lightweight track ids for resolve-status without loading full album docs. */
  trackIds?: string[]
  artistIds?: string[]
  archivedAt?: Date
}

interface AlbumPickerItemDocument {
  id: string
  title: string
  artist: string
  albumYear?: string
  coverUrlSmall?: string
  releaseMbid?: string
  importedAt?: AlbumDocument['importedAt']
  titleLower: string
  artistLower: string
  titleTokens?: string[]
  artistTokens?: string[]
  trackIds?: string[]
  artistIds?: string[]
  archivedAt?: AlbumDocument['archivedAt']
}

/** Library grid card — picker fields scoped to the signed-in user's album_entries. */
export interface LibraryAlbumCard {
  id: string
  title: string
  artist: string
  albumYear?: string
  coverUrlSmall?: string
  trackIds: string[]
  artistIds: string[]
  rating?: StarRating
  ratingSource?: RatingSource
  ratingSubmittedPipelineId?: string
}

const FIRESTORE_IN_QUERY_LIMIT = 30
const ALBUM_READ_CONCURRENCY = 8

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

export function tokenizeAlbumPickerText(value: string): string[] {
  const normalized = normalizeAlbumPickerText(value)
  if (!normalized) return []
  return [...new Set(normalized.split(/[^a-z0-9]+/g).filter(Boolean))]
}

/** Test/helper: clear in-memory picker sync gate. */
export function resetAlbumPickerSyncGateForTests(): void {
  albumPickerSyncedUids.clear()
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function toAlbumPickerItem(id: string, data: AlbumPickerItemDocument): AlbumPickerItem {
  return {
    id,
    title: data.title,
    artist: data.artist,
    albumYear: data.albumYear,
    coverUrlSmall: data.coverUrlSmall,
    releaseMbid: data.releaseMbid,
    importedAt: data.importedAt?.toDate(),
    titleLower: data.titleLower,
    artistLower: data.artistLower,
    titleTokens: data.titleTokens,
    artistTokens: data.artistTokens,
    trackIds: Array.isArray(data.trackIds) ? data.trackIds : undefined,
    artistIds: Array.isArray(data.artistIds) ? data.artistIds : undefined,
    archivedAt: data.archivedAt?.toDate(),
  }
}

function pickerNeedsTrackProjection(data: AlbumPickerItemDocument | undefined): boolean {
  if (!data) return true
  if (!Array.isArray(data.titleTokens) || !Array.isArray(data.artistTokens)) return true
  if (!Array.isArray(data.trackIds)) return true
  if (typeof data.releaseMbid !== 'string') return true
  return false
}

export function buildAlbumPickerItemFromAlbum(album: Album): Record<string, unknown> {
  const titleLower = normalizeAlbumPickerText(album.title)
  const artistLower = normalizeAlbumPickerText(album.artist)
  const artistIds = album.artistIds?.length
    ? album.artistIds
    : album.artistId
      ? [album.artistId]
      : []
  return omitUndefined({
    id: album.id,
    title: album.title,
    artist: album.artist,
    albumYear: album.albumYear,
    coverUrlSmall: album.coverUrlSmall,
    releaseMbid: album.releaseMbid,
    importedAt: album.importedAt,
    titleLower,
    artistLower,
    titleTokens: tokenizeAlbumPickerText(titleLower),
    artistTokens: tokenizeAlbumPickerText(artistLower),
    trackIds: album.tracks.map((track) => track.id),
    artistIds,
    archivedAt: album.archivedAt,
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

/** Rebuilds lightweight album_picker projection from the global album catalog. */
export async function syncMissingAlbumPickerItems(uid: string): Promise<number> {
  const [sourceSnapshot, pickerSnapshot] = await Promise.all([
    getDocs(albumsCollection(uid)),
    getDocs(albumPickerCollection(uid)),
  ])
  if (sourceSnapshot.empty) return 0

  const existingIds = new Set(pickerSnapshot.docs.map((docSnap) => docSnap.id))
  const sourceAlbums = sourceSnapshot.docs
    .map((docSnap) => toAlbum(docSnap.id, docSnap.data() as AlbumDocument))
  const pickerDocsById = new Map(
    pickerSnapshot.docs.map((docSnap) => [docSnap.id, docSnap.data() as AlbumPickerItemDocument]),
  )
  const albumsToUpsert = sourceAlbums.filter((album) => {
    const existing = pickerDocsById.get(album.id)
    if (!existingIds.has(album.id)) return true
    return pickerNeedsTrackProjection(existing)
  })

  for (let index = 0; index < albumsToUpsert.length; index += ALBUM_PICKER_WRITE_CHUNK) {
    const chunk = albumsToUpsert.slice(index, index + ALBUM_PICKER_WRITE_CHUNK)
    await Promise.all(chunk.map((album) => upsertAlbumPickerItem(uid, album)))
  }

  return albumsToUpsert.length
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

    const all = snapshot.docs
      .map((docSnap) =>
        toAlbumPickerItem(docSnap.id, docSnap.data() as AlbumPickerItemDocument),
      )
      .filter((item) => !item.archivedAt)
    const items = all.slice(0, pageSize)
    const last = items.length > 0 ? items[items.length - 1] : undefined
    const nextCursor =
      all.length > pageSize && last ? { titleLower: last.titleLower, id: last.id } : undefined
    return { items, nextCursor }
  }

  const searchUpperBound = `${normalizedSearch}\uf8ff`
  const [titleTokenSnapshot, artistTokenSnapshot, titlePrefixSnapshot, artistPrefixSnapshot] =
    await Promise.all([
      getDocs(
        query(
          albumPickerCollection(uid),
          where('titleTokens', 'array-contains', normalizedSearch),
          limit(pageSize),
        ),
      ),
      getDocs(
        query(
          albumPickerCollection(uid),
          where('artistTokens', 'array-contains', normalizedSearch),
          limit(pageSize),
        ),
      ),
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

  const titleTokenMatches = titleTokenSnapshot.docs.map((docSnap) =>
    toAlbumPickerItem(docSnap.id, docSnap.data() as AlbumPickerItemDocument),
  )
  const artistTokenMatches = artistTokenSnapshot.docs.map((docSnap) =>
    toAlbumPickerItem(docSnap.id, docSnap.data() as AlbumPickerItemDocument),
  )
  const titlePrefixMatches = titlePrefixSnapshot.docs.map((docSnap) =>
    toAlbumPickerItem(docSnap.id, docSnap.data() as AlbumPickerItemDocument),
  )
  const artistPrefixMatches = artistPrefixSnapshot.docs.map((docSnap) =>
    toAlbumPickerItem(docSnap.id, docSnap.data() as AlbumPickerItemDocument),
  )

  return {
    items: mergeAlbumPickerMatches(
      [...titleTokenMatches, ...titlePrefixMatches],
      [...artistTokenMatches, ...artistPrefixMatches],
      pageSize,
    ).filter((item) => !item.archivedAt),
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
    archivedAt: data.archivedAt?.toDate(),
    archivedBy: data.archivedBy,
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
  return applyAlbumEntryOverlay(album, entry)
}

export async function listAlbums(
  uid: string,
  options: { includeArchived?: boolean } = {},
): Promise<Album[]> {
  const snapshot = await getDocs(albumsCollection(uid))
  const albums = snapshot.docs.map((docSnap) =>
    toAlbum(docSnap.id, docSnap.data() as AlbumDocument),
  )
  const entries = await listUserAlbumEntries(uid)
  const visible = options.includeArchived
    ? albums
    : albums.filter((album) => !isAlbumArchived(album))
  return visible
    .map((album) => applyAlbumEntryOverlay(album, entries.get(album.id)))
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function listUserAlbumEntryIds(uid: string): Promise<string[]> {
  const snapshot = await getDocs(collection(getFirestoreDb(), 'users', uid, 'album_entries'))
  return snapshot.docs.map((docSnap) => docSnap.id)
}

async function listUserAlbumEntries(uid: string): Promise<Map<string, AlbumEntry>> {
  const snapshot = await getDocs(collection(getFirestoreDb(), 'users', uid, 'album_entries'))
  const result = new Map<string, AlbumEntry>()
  for (const docSnap of snapshot.docs) {
    result.set(docSnap.id, toAlbumEntry(docSnap.data() as AlbumEntryDocument))
  }
  return result
}

async function getAlbumEntriesByIds(
  uid: string,
  albumIds: string[],
): Promise<Map<string, AlbumEntry>> {
  const result = new Map<string, AlbumEntry>()
  const uniqueIds = [...new Set(albumIds)]
  if (uniqueIds.length === 0) return result

  await Promise.all(
    uniqueIds.map(async (albumId) => {
      const entry = await getAlbumEntry(uid, albumId)
      if (entry) result.set(albumId, entry)
    }),
  )
  return result
}

async function getAlbumsByIds(uid: string, albumIds: string[]): Promise<Map<string, Album>> {
  void uid
  const result = new Map<string, Album>()
  const uniqueIds = [...new Set(albumIds)]
  if (uniqueIds.length === 0) return result

  const chunks = chunkArray(uniqueIds, FIRESTORE_IN_QUERY_LIMIT)
  for (let i = 0; i < chunks.length; i += ALBUM_READ_CONCURRENCY) {
    const batch = chunks.slice(i, i + ALBUM_READ_CONCURRENCY)
    const snapshots = await Promise.all(
      batch.map((chunk) =>
        getDocs(query(albumsCollection(uid), where(documentId(), 'in', chunk))),
      ),
    )
    for (const snapshot of snapshots) {
      for (const docSnap of snapshot.docs) {
        result.set(docSnap.id, toAlbum(docSnap.id, docSnap.data() as AlbumDocument))
      }
    }
  }

  return result
}

/** Batch-load full album docs (includes tracks). Prefer picker/cards for grid UIs. */
export async function getAlbumsByIdsForUser(
  uid: string,
  albumIds: string[],
): Promise<Map<string, Album>> {
  const [albums, entries] = await Promise.all([
    getAlbumsByIds(uid, albumIds),
    getAlbumEntriesByIds(uid, albumIds),
  ])
  const result = new Map<string, Album>()
  for (const [id, album] of albums) {
    result.set(id, applyAlbumEntryOverlay(album, entries.get(id)))
  }
  return result
}

export function albumStubFromPickerItem(item: AlbumPickerItem): Album {
  const artistIds = item.artistIds?.length ? item.artistIds : []
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    artistId: artistIds[0] ?? '',
    artistIds,
    albumYear: item.albumYear,
    releaseMbid: item.releaseMbid ?? '',
    coverUrlSmall: item.coverUrlSmall,
    tracks: (item.trackIds ?? []).map((id, index) => ({
      id,
      trackNumber: String(index + 1),
      title: '',
    })),
    importedAt: item.importedAt ?? new Date(0),
  }
}

async function getAlbumPickerItemsByIds(
  uid: string,
  albumIds: string[],
): Promise<Map<string, AlbumPickerItem>> {
  const result = new Map<string, AlbumPickerItem>()
  const uniqueIds = [...new Set(albumIds)]
  if (uniqueIds.length === 0) return result

  const chunks = chunkArray(uniqueIds, FIRESTORE_IN_QUERY_LIMIT)
  for (let i = 0; i < chunks.length; i += ALBUM_READ_CONCURRENCY) {
    const batch = chunks.slice(i, i + ALBUM_READ_CONCURRENCY)
    const snapshots = await Promise.all(
      batch.map((chunk) =>
        getDocs(query(albumPickerCollection(uid), where(documentId(), 'in', chunk))),
      ),
    )
    for (const snapshot of snapshots) {
      for (const docSnap of snapshot.docs) {
        result.set(
          docSnap.id,
          toAlbumPickerItem(docSnap.id, docSnap.data() as AlbumPickerItemDocument),
        )
      }
    }
  }

  return result
}

export async function getAlbumPickerItemsByIdsForUser(
  uid: string,
  albumIds: string[],
): Promise<Map<string, AlbumPickerItem>> {
  return getAlbumPickerItemsByIds(uid, albumIds)
}

/**
 * Ensures album_picker docs exist (with trackIds) for the given album ids only —
 * scoped to the user's library, not the global catalog.
 */
export async function ensureAlbumPickerForAlbumIds(
  uid: string,
  albumIds: string[],
): Promise<number> {
  const uniqueIds = [...new Set(albumIds)]
  if (uniqueIds.length === 0) return 0

  const existing = await getAlbumPickerItemsByIds(uid, uniqueIds)
  const missingIds = uniqueIds.filter((id) => {
    const item = existing.get(id)
    return (
      !item ||
      !Array.isArray(item.trackIds) ||
      !item.releaseMbid ||
      !Array.isArray(item.titleTokens) ||
      !Array.isArray(item.artistTokens)
    )
  })
  if (missingIds.length === 0) return 0

  const albums = await getAlbumsByIds(uid, missingIds)
  const toUpsert = [...albums.values()]
  for (let index = 0; index < toUpsert.length; index += ALBUM_PICKER_WRITE_CHUNK) {
    const chunk = toUpsert.slice(index, index + ALBUM_PICKER_WRITE_CHUNK)
    await Promise.all(chunk.map((album) => upsertAlbumPickerItem(uid, album)))
  }
  return toUpsert.length
}

/** User-scoped library grid: album_entries → album_picker cards (no full track payloads). */
export async function listUserLibraryCards(uid: string): Promise<LibraryAlbumCard[]> {
  const entries = await listUserAlbumEntries(uid)
  const entryIds = [...entries.keys()]
  if (entryIds.length === 0) return []

  await ensureAlbumPickerForAlbumIds(uid, entryIds)
  const pickers = await getAlbumPickerItemsByIds(uid, entryIds)

  return entryIds
    .flatMap((id) => {
      const item = pickers.get(id)
      if (!item || item.archivedAt) return []
      const entry = entries.get(id)
      return [
        {
          id: item.id,
          title: item.title,
          artist: item.artist,
          albumYear: item.albumYear,
          coverUrlSmall: item.coverUrlSmall,
          trackIds: filterTrackIdsByExclusions(item.trackIds ?? [], entry?.excludedTrackIds),
          artistIds: item.artistIds ?? [],
          rating: entry?.rating,
          ratingSource: entry?.ratingSource,
          ratingSubmittedPipelineId: entry?.ratingSubmittedPipelineId,
        } satisfies LibraryAlbumCard,
      ]
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function listAlbumsByArtist(uid: string, artistId: string): Promise<Album[]> {
  const snapshot = await getDocs(
    query(albumsCollection(uid), where('artistIds', 'array-contains', artistId)),
  )
  const entries = await listUserAlbumEntries(uid)
  return snapshot.docs
    .map((docSnap) =>
      applyAlbumEntryOverlay(
        toAlbum(docSnap.id, docSnap.data() as AlbumDocument),
        entries.get(docSnap.id),
      ),
    )
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
    if (isAlbumArchived(existing)) {
      await restoreArchivedAlbum(existing.id)
      const restored = await getAlbumById(uid, existing.id)
      if (!restored) throw new Error('Album not found after restore')
      await upsertAlbumPickerItem(uid, restored)
      return restored
    }
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

export async function updateAlbumTitle(
  uid: string,
  albumId: string,
  title: string,
): Promise<Album> {
  const trimmed = title.trim()
  if (!trimmed) {
    throw new Error('Album title is required')
  }

  const current = await getAlbumById(uid, albumId)
  if (!current) throw new Error('Album not found')
  if (current.title === trimmed) return current

  const ref = doc(getFirestoreDb(), 'albums', albumId)
  await updateDoc(ref, { title: trimmed })

  const updated = await getAlbumById(uid, albumId)
  if (!updated) throw new Error('Album not found')
  await upsertAlbumPickerItem(uid, updated)
  return updated
}

export async function updateTrackTitle(
  uid: string,
  albumId: string,
  trackId: string,
  title: string,
): Promise<Album> {
  const ref = doc(getFirestoreDb(), 'albums', albumId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) {
    throw new Error('Album not found')
  }

  const catalog = toAlbum(snapshot.id, snapshot.data() as AlbumDocument)
  const nextTracks = replaceTrackTitle(catalog.tracks, trackId, title)
  const unchanged = nextTracks.every(
    (track, index) => track.title === catalog.tracks[index]?.title,
  )
  if (!unchanged) {
    await updateDoc(ref, {
      tracks: nextTracks.map((track) => omitUndefined(track)),
    })
  }

  const updated = await getAlbumById(uid, albumId)
  if (!updated) throw new Error('Album not found')
  return updated
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

/** Soft-delete a track for this user (catalog tracklist stays intact). */
export async function excludeTrackFromAlbum(
  uid: string,
  albumId: string,
  trackId: string,
): Promise<Album> {
  await ensureAlbumEntry(uid, albumId)
  const ref = doc(getFirestoreDb(), 'users', uid, 'album_entries', albumId)
  const entry = await getAlbumEntry(uid, albumId)
  const excluded = new Set(entry?.excludedTrackIds ?? [])
  excluded.add(trackId)
  await updateDoc(ref, {
    excludedTrackIds: [...excluded],
    updatedAt: serverTimestamp(),
  })
  await deleteTrackMapping(uid, trackId)

  const album = await getAlbumById(uid, albumId)
  if (!album) throw new Error('Album not found')
  return album
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
