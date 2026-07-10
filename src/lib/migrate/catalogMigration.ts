import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type UpdateData,
} from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import type {
  AlbumDocument,
  AlbumEntryDocument,
  ArtistDocument,
  ArtistPrefsDocument,
  PlaylistMembershipDocument,
} from '@/types/library'

interface MigrationUserContext {
  uid: string
  albumIdMap: Map<string, string>
  trackIdMap: Map<string, string>
  artistIdMap: Map<string, string>
}

export interface CatalogMigrationSummary {
  users: number
  albumsScanned: number
  albumsMerged: number
  artistsScanned: number
  artistsMerged: number
  entriesCreated: number
  playlistMembersRewritten: number
  stageMembershipsRewritten: number
  sessionsRewritten: number
  listensRewritten: number
  trackStatsRewritten: number
}

const EMPTY_SUMMARY: CatalogMigrationSummary = {
  users: 0,
  albumsScanned: 0,
  albumsMerged: 0,
  artistsScanned: 0,
  artistsMerged: 0,
  entriesCreated: 0,
  playlistMembersRewritten: 0,
  stageMembershipsRewritten: 0,
  sessionsRewritten: 0,
  listensRewritten: 0,
  trackStatsRewritten: 0,
}

function normalize(value?: string): string {
  return value?.trim().toLowerCase() ?? ''
}

function canonicalTrackKey(track: { trackNumber?: string; title?: string }): string {
  return `${track.trackNumber ?? ''}|${normalize(track.title)}`
}

async function listUserIds(explicitUserIds?: string[]): Promise<string[]> {
  if (explicitUserIds?.length) return explicitUserIds
  const snapshot = await getDocs(collection(getFirestoreDb(), 'users'))
  return snapshot.docs.map((docSnap) => docSnap.id)
}

async function ensureCanonicalArtist(
  artist: ArtistDocument,
): Promise<{ canonicalArtistId: string; created: boolean }> {
  const db = getFirestoreDb()
  const byMbid = artist.artistMbid
    ? await getDocs(collection(db, 'artists'))
    : await getDocs(collection(db, 'artists'))

  const existing = byMbid.docs.find((docSnap) => {
    const data = docSnap.data() as ArtistDocument
    if (artist.artistMbid && data.artistMbid === artist.artistMbid) return true
    return normalize(data.nameLower) === normalize(artist.nameLower)
  })

  if (existing) {
    return { canonicalArtistId: existing.id, created: false }
  }

  const canonicalArtistId = crypto.randomUUID()
  await setDoc(doc(db, 'artists', canonicalArtistId), {
    ...artist,
    id: canonicalArtistId,
    importedAt: artist.importedAt ?? serverTimestamp(),
  })
  return { canonicalArtistId, created: true }
}

async function ensureCanonicalAlbum(
  album: AlbumDocument,
): Promise<{ canonicalAlbumId: string; created: boolean; canonicalAlbum: AlbumDocument }> {
  const db = getFirestoreDb()
  const snapshot = await getDocs(collection(db, 'albums'))
  const existing = snapshot.docs.find((docSnap) => {
    const data = docSnap.data() as AlbumDocument
    if (!album.releaseMbid || !data.releaseMbid) return false
    return data.releaseMbid === album.releaseMbid
  })
  if (existing) {
    return {
      canonicalAlbumId: existing.id,
      created: false,
      canonicalAlbum: existing.data() as AlbumDocument,
    }
  }

  const canonicalAlbumId = crypto.randomUUID()
  const canonicalAlbum: AlbumDocument = {
    ...album,
    id: canonicalAlbumId,
    importedAt: album.importedAt ?? (serverTimestamp() as never),
  }
  await setDoc(doc(db, 'albums', canonicalAlbumId), canonicalAlbum)
  return { canonicalAlbumId, created: true, canonicalAlbum }
}

async function buildContextForUser(uid: string, summary: CatalogMigrationSummary): Promise<MigrationUserContext> {
  const db = getFirestoreDb()
  const albumIdMap = new Map<string, string>()
  const artistIdMap = new Map<string, string>()
  const trackIdMap = new Map<string, string>()

  const artistsSnapshot = await getDocs(collection(db, 'users', uid, 'artists'))
  for (const artistDoc of artistsSnapshot.docs) {
    const artist = artistDoc.data() as ArtistDocument
    summary.artistsScanned++
    const ensured = await ensureCanonicalArtist(artist)
    if (ensured.created) summary.artistsMerged++
    artistIdMap.set(artistDoc.id, ensured.canonicalArtistId)

    const prefsPayload: ArtistPrefsDocument = {
      artistId: ensured.canonicalArtistId,
      scrobbleName: artist.scrobbleName,
      preferredYouTubeChannelId: artist.preferredYouTubeChannelId,
      preferredYouTubeChannelTitle: artist.preferredYouTubeChannelTitle,
    }
    await setDoc(doc(db, 'users', uid, 'artist_prefs', ensured.canonicalArtistId), prefsPayload, {
      merge: true,
    })
  }

  const albumsSnapshot = await getDocs(collection(db, 'users', uid, 'albums'))
  for (const albumDoc of albumsSnapshot.docs) {
    const album = albumDoc.data() as AlbumDocument
    summary.albumsScanned++
    const ensured = await ensureCanonicalAlbum(album)
    if (ensured.created) summary.albumsMerged++
    albumIdMap.set(albumDoc.id, ensured.canonicalAlbumId)

    const entry: Partial<AlbumEntryDocument> = {
      albumId: ensured.canonicalAlbumId,
      rating: album.rating,
      ratingSource: album.ratingSource,
      ratingSubmittedPipelineId: album.ratingSubmittedPipelineId,
      ratingBeforeSubmission: album.ratingBeforeSubmission,
      ratedAt: album.ratedAt,
      createdAt: album.importedAt,
      updatedAt: serverTimestamp() as never,
    }
    await setDoc(doc(db, 'users', uid, 'album_entries', ensured.canonicalAlbumId), entry, { merge: true })
    summary.entriesCreated++

    const canonicalTrackByKey = new Map<string, string>()
    for (const track of ensured.canonicalAlbum.tracks ?? []) {
      canonicalTrackByKey.set(canonicalTrackKey(track), track.id)
    }
    for (const oldTrack of album.tracks ?? []) {
      const canonicalTrackId = canonicalTrackByKey.get(canonicalTrackKey(oldTrack))
      if (canonicalTrackId) {
        trackIdMap.set(oldTrack.id, canonicalTrackId)
      }
    }
  }

  return { uid, albumIdMap, trackIdMap, artistIdMap }
}

async function remapPlaylistMembers(ctx: MigrationUserContext, summary: CatalogMigrationSummary) {
  const db = getFirestoreDb()
  const playlistsSnapshot = await getDocs(collection(db, 'users', ctx.uid, 'playlists'))
  for (const playlistDoc of playlistsSnapshot.docs) {
    const membersSnapshot = await getDocs(collection(db, 'users', ctx.uid, 'playlists', playlistDoc.id, 'members'))
    for (const memberDoc of membersSnapshot.docs) {
      const data = memberDoc.data() as PlaylistMembershipDocument
      const mapped = ctx.albumIdMap.get(data.albumId)
      if (!mapped || mapped === data.albumId) continue
      await setDoc(
        doc(db, 'users', ctx.uid, 'playlists', playlistDoc.id, 'members', mapped),
        { ...data, albumId: mapped },
        { merge: true },
      )
      const batch = writeBatch(db)
      batch.delete(memberDoc.ref)
      await batch.commit()
      summary.playlistMembersRewritten++
    }
  }
}

async function remapPipelineAndSessionDocs(ctx: MigrationUserContext, summary: CatalogMigrationSummary) {
  const db = getFirestoreDb()

  const stageMemberships = await getDocs(collection(db, 'users', ctx.uid, 'stage_memberships'))
  for (const docSnap of stageMemberships.docs) {
    const data = docSnap.data() as DocumentData
    const mappedAlbumId = ctx.albumIdMap.get(String(data.albumId))
    if (mappedAlbumId && mappedAlbumId !== data.albumId) {
      await updateDoc(docSnap.ref, { albumId: mappedAlbumId })
      summary.stageMembershipsRewritten++
    }
  }

  const sessions = await getDocs(collection(db, 'users', ctx.uid, 'playback_sessions'))
  for (const docSnap of sessions.docs) {
    const data = docSnap.data() as DocumentData
    const mappedAlbumId = ctx.albumIdMap.get(String(data.albumId))
    if (mappedAlbumId && mappedAlbumId !== data.albumId) {
      await updateDoc(docSnap.ref, { albumId: mappedAlbumId })
      summary.sessionsRewritten++
    }
  }

  const listens = await getDocs(collection(db, 'users', ctx.uid, 'track_listens'))
  for (const docSnap of listens.docs) {
    const data = docSnap.data() as DocumentData
    const updates: UpdateData<DocumentData> = {}
    const mappedAlbumId = ctx.albumIdMap.get(String(data.albumId))
    const mappedTrackId = ctx.trackIdMap.get(String(data.trackId))
    if (mappedAlbumId && mappedAlbumId !== data.albumId) updates.albumId = mappedAlbumId
    if (mappedTrackId && mappedTrackId !== data.trackId) updates.trackId = mappedTrackId
    if (Object.keys(updates).length > 0) {
      await updateDoc(docSnap.ref, updates)
      summary.listensRewritten++
    }
  }

  const trackStats = await getDocs(collection(db, 'users', ctx.uid, 'track_stats'))
  for (const docSnap of trackStats.docs) {
    const mappedTrackId = ctx.trackIdMap.get(docSnap.id)
    if (!mappedTrackId || mappedTrackId === docSnap.id) continue
    await setDoc(doc(db, 'users', ctx.uid, 'track_stats', mappedTrackId), docSnap.data(), { merge: true })
    await deleteDoc(docSnap.ref)
    summary.trackStatsRewritten++
  }
}

export async function runCatalogMigration(userIds?: string[]): Promise<CatalogMigrationSummary> {
  const summary: CatalogMigrationSummary = { ...EMPTY_SUMMARY }
  const resolvedUserIds = await listUserIds(userIds)
  summary.users = resolvedUserIds.length

  for (const uid of resolvedUserIds) {
    const context = await buildContextForUser(uid, summary)
    await remapPlaylistMembers(context, summary)
    await remapPipelineAndSessionDocs(context, summary)
  }

  return summary
}
