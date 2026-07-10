/**
 * Phase 2 catalog migration (admin).
 * Uses Firebase CLI credentials — run `firebase login` first.
 *
 * Usage:
 *   MIGRATE_CONFIRM=yes npm run migrate:catalog
 */
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(__dirname, '../functions/package.json'))
const firebaseToolsRoot = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'firebase-tools')

const { requireAuth } = require(path.join(firebaseToolsRoot, 'lib/requireAuth'))
const { getGlobalDefaultAccount, setActiveAccount } = require(path.join(firebaseToolsRoot, 'lib/auth'))
const defaultCredentials = require(path.join(firebaseToolsRoot, 'lib/defaultCredentials'))
const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'tunicious-40e1b'

const options = {
  project: projectId,
  projectId,
  interactive: false,
  nonInteractive: true,
}

function omitUndefined(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry
  }
  return out
}

function normalize(value) {
  return value?.trim().toLowerCase() ?? ''
}

function canonicalTrackKey(track) {
  return `${track.trackNumber ?? ''}|${normalize(track.title)}`
}

function stripAlbumPersonalFields(album) {
  const {
    rating,
    ratingSource,
    ratingSubmittedPipelineId,
    ratingBeforeSubmission,
    ratedAt,
    ...catalog
  } = album
  void rating
  void ratingSource
  void ratingSubmittedPipelineId
  void ratingBeforeSubmission
  void ratedAt
  return catalog
}

function stripArtistPersonalFields(artist) {
  const {
    scrobbleName,
    preferredYouTubeChannelId,
    preferredYouTubeChannelTitle,
    ...catalog
  } = artist
  void scrobbleName
  void preferredYouTubeChannelId
  void preferredYouTubeChannelTitle
  return catalog
}

async function getAdminDb() {
  const account = getGlobalDefaultAccount()
  if (!account) {
    throw new Error('Not logged in. Run `firebase login` first.')
  }
  setActiveAccount(options, account)
  const email = await requireAuth(options)
  console.log(`Authenticated as ${email ?? account.user.email}`)
  process.env.GOOGLE_APPLICATION_CREDENTIALS = await defaultCredentials.getCredentialPathAsync(account)
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId })
  }
  return getFirestore()
}

async function listRootUserIds(db) {
  if (process.env.MIGRATION_USER_IDS) {
    return process.env.MIGRATION_USER_IDS.split(',').map((id) => id.trim()).filter(Boolean)
  }
  const snapshot = await db.collection('users').get()
  return snapshot.docs.map((doc) => doc.id)
}

async function loadGlobalCaches(db, artistByMbid, artistByNameLower, albumByReleaseMbid) {
  const [artistsSnap, albumsSnap] = await Promise.all([
    db.collection('artists').get(),
    db.collection('albums').get(),
  ])
  for (const doc of artistsSnap.docs) {
    const data = doc.data()
    if (data.artistMbid) artistByMbid.set(data.artistMbid, doc.id)
    artistByNameLower.set(normalize(data.nameLower), doc.id)
  }
  for (const doc of albumsSnap.docs) {
    const data = doc.data()
    if (data.releaseMbid) albumByReleaseMbid.set(data.releaseMbid, { id: doc.id, data })
  }
}

async function ensureCanonicalArtist(db, artist, importedBy, artistByMbid, artistByNameLower) {
  if (artist.artistMbid && artistByMbid.has(artist.artistMbid)) {
    return { canonicalArtistId: artistByMbid.get(artist.artistMbid), created: false }
  }
  const nameKey = normalize(artist.nameLower)
  if (artistByNameLower.has(nameKey)) {
    return { canonicalArtistId: artistByNameLower.get(nameKey), created: false }
  }

  const canonicalArtistId = crypto.randomUUID()
  await db.collection('artists').doc(canonicalArtistId).set({
    ...stripArtistPersonalFields(artist),
    id: canonicalArtistId,
    importedAt: artist.importedAt ?? FieldValue.serverTimestamp(),
    importedBy,
  })
  if (artist.artistMbid) artistByMbid.set(artist.artistMbid, canonicalArtistId)
  artistByNameLower.set(nameKey, canonicalArtistId)
  return { canonicalArtistId, created: true }
}

async function ensureCanonicalAlbum(
  db,
  album,
  importedBy,
  artistIdMap,
  albumByReleaseMbid,
) {
  const releaseMbid = album.releaseMbid?.trim()
  if (releaseMbid && albumByReleaseMbid.has(releaseMbid)) {
    const existing = albumByReleaseMbid.get(releaseMbid)
    return {
      canonicalAlbumId: existing.id,
      created: false,
      canonicalAlbum: existing.data,
    }
  }

  const canonicalAlbumId = crypto.randomUUID()
  const canonicalArtistIds = (album.artistIds ?? []).map((id) => artistIdMap.get(id) ?? id)
  const canonicalArtistId = artistIdMap.get(album.artistId) ?? album.artistId
  const canonicalAlbum = stripAlbumPersonalFields({
    ...album,
    id: canonicalAlbumId,
    artistIds: canonicalArtistIds,
    artistId: canonicalArtistId,
    importedAt: album.importedAt ?? FieldValue.serverTimestamp(),
    importedBy,
  })

  await db.collection('albums').doc(canonicalAlbumId).set(canonicalAlbum)
  if (releaseMbid) {
    albumByReleaseMbid.set(releaseMbid, { id: canonicalAlbumId, data: canonicalAlbum })
  }
  return { canonicalAlbumId, created: true, canonicalAlbum }
}

async function buildContextForUser(db, uid, summary, artistByMbid, artistByNameLower, albumByReleaseMbid) {
  const albumIdMap = new Map()
  const artistIdMap = new Map()
  const trackIdMap = new Map()

  const artistsSnapshot = await db.collection('users').doc(uid).collection('artists').get()
  for (const artistDoc of artistsSnapshot.docs) {
    const artist = artistDoc.data()
    summary.artistsScanned++
    const ensured = await ensureCanonicalArtist(
      db,
      artist,
      uid,
      artistByMbid,
      artistByNameLower,
    )
    if (ensured.created) summary.artistsMerged++
    artistIdMap.set(artistDoc.id, ensured.canonicalArtistId)

    await db
      .collection('users')
      .doc(uid)
      .collection('artist_prefs')
      .doc(ensured.canonicalArtistId)
      .set(
        omitUndefined({
          artistId: ensured.canonicalArtistId,
          scrobbleName: artist.scrobbleName,
          preferredYouTubeChannelId: artist.preferredYouTubeChannelId,
          preferredYouTubeChannelTitle: artist.preferredYouTubeChannelTitle,
        }),
        { merge: true },
      )
  }

  const albumsSnapshot = await db.collection('users').doc(uid).collection('albums').get()
  for (const albumDoc of albumsSnapshot.docs) {
    const album = albumDoc.data()
    summary.albumsScanned++
    const ensured = await ensureCanonicalAlbum(db, album, uid, artistIdMap, albumByReleaseMbid)
    if (ensured.created) summary.albumsMerged++
    albumIdMap.set(albumDoc.id, ensured.canonicalAlbumId)

    await db
      .collection('users')
      .doc(uid)
      .collection('album_entries')
      .doc(ensured.canonicalAlbumId)
      .set(
        omitUndefined({
          albumId: ensured.canonicalAlbumId,
          rating: album.rating,
          ratingSource: album.ratingSource,
          ratingSubmittedPipelineId: album.ratingSubmittedPipelineId,
          ratingBeforeSubmission: album.ratingBeforeSubmission,
          ratedAt: album.ratedAt,
          createdAt: album.importedAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }),
        { merge: true },
      )
    summary.entriesCreated++

    const canonicalTrackByKey = new Map()
    for (const track of ensured.canonicalAlbum.tracks ?? []) {
      canonicalTrackByKey.set(canonicalTrackKey(track), track.id)
    }
    for (const oldTrack of album.tracks ?? []) {
      const canonicalTrackId = canonicalTrackByKey.get(canonicalTrackKey(oldTrack))
      if (canonicalTrackId) {
        trackIdMap.set(oldTrack.id, canonicalTrackId)
      }
    }

    const pickerRef = db.collection('users').doc(uid).collection('album_picker').doc(albumDoc.id)
    const pickerSnap = await pickerRef.get()
    if (pickerSnap.exists) {
      const pickerData = pickerSnap.data()
      await db
        .collection('album_picker')
        .doc(ensured.canonicalAlbumId)
        .set({ ...pickerData, id: ensured.canonicalAlbumId }, { merge: true })
      summary.pickerItemsMigrated++
    }
  }

  const youtubeSnapshot = await db.collection('users').doc(uid).collection('youtube_mappings').get()
  for (const mappingDoc of youtubeSnapshot.docs) {
    const mappedTrackId = trackIdMap.get(mappingDoc.id) ?? mappingDoc.id
    await db
      .collection('youtube_mappings')
      .doc(mappedTrackId)
      .set({ ...mappingDoc.data(), trackId: mappedTrackId }, { merge: true })
    summary.youtubeMappingsMigrated++
  }

  return { uid, albumIdMap, trackIdMap, artistIdMap }
}

async function remapPlaylistMembers(db, ctx, summary) {
  const playlistsSnapshot = await db.collection('users').doc(ctx.uid).collection('playlists').get()
  for (const playlistDoc of playlistsSnapshot.docs) {
    const membersSnapshot = await playlistDoc.ref.collection('members').get()
    for (const memberDoc of membersSnapshot.docs) {
      const data = memberDoc.data()
      const mapped = ctx.albumIdMap.get(data.albumId)
      if (!mapped || mapped === data.albumId) continue
      await playlistDoc.ref.collection('members').doc(mapped).set({ ...data, albumId: mapped }, { merge: true })
      await memberDoc.ref.delete()
      summary.playlistMembersRewritten++
    }
  }
}

async function remapPipelineAndSessionDocs(db, ctx, summary) {
  const stageMemberships = await db.collection('users').doc(ctx.uid).collection('stage_memberships').get()
  for (const docSnap of stageMemberships.docs) {
    const data = docSnap.data()
    const mappedAlbumId = ctx.albumIdMap.get(String(data.albumId))
    if (mappedAlbumId && mappedAlbumId !== data.albumId) {
      await docSnap.ref.update({ albumId: mappedAlbumId })
      summary.stageMembershipsRewritten++
    }
  }

  const sessions = await db.collection('users').doc(ctx.uid).collection('playback_sessions').get()
  for (const docSnap of sessions.docs) {
    const data = docSnap.data()
    const mappedAlbumId = ctx.albumIdMap.get(String(data.albumId))
    if (mappedAlbumId && mappedAlbumId !== data.albumId) {
      await docSnap.ref.update({ albumId: mappedAlbumId })
      summary.sessionsRewritten++
    }
  }

  const listens = await db.collection('users').doc(ctx.uid).collection('track_listens').get()
  for (const docSnap of listens.docs) {
    const data = docSnap.data()
    const updates = {}
    const mappedAlbumId = ctx.albumIdMap.get(String(data.albumId))
    const mappedTrackId = ctx.trackIdMap.get(String(data.trackId))
    if (mappedAlbumId && mappedAlbumId !== data.albumId) updates.albumId = mappedAlbumId
    if (mappedTrackId && mappedTrackId !== data.trackId) updates.trackId = mappedTrackId
    if (Object.keys(updates).length > 0) {
      await docSnap.ref.update(updates)
      summary.listensRewritten++
    }
  }

  const trackStats = await db.collection('users').doc(ctx.uid).collection('track_stats').get()
  for (const docSnap of trackStats.docs) {
    const mappedTrackId = ctx.trackIdMap.get(docSnap.id)
    if (!mappedTrackId || mappedTrackId === docSnap.id) continue
    await db
      .collection('users')
      .doc(ctx.uid)
      .collection('track_stats')
      .doc(mappedTrackId)
      .set(docSnap.data(), { merge: true })
    await docSnap.ref.delete()
    summary.trackStatsRewritten++
  }
}

async function runCatalogMigration(db) {
  const summary = {
    users: 0,
    albumsScanned: 0,
    albumsMerged: 0,
    artistsScanned: 0,
    artistsMerged: 0,
    entriesCreated: 0,
    pickerItemsMigrated: 0,
    youtubeMappingsMigrated: 0,
    playlistMembersRewritten: 0,
    stageMembershipsRewritten: 0,
    sessionsRewritten: 0,
    listensRewritten: 0,
    trackStatsRewritten: 0,
  }

  const artistByMbid = new Map()
  const artistByNameLower = new Map()
  const albumByReleaseMbid = new Map()
  await loadGlobalCaches(db, artistByMbid, artistByNameLower, albumByReleaseMbid)

  const userIds = await listRootUserIds(db)
  summary.users = userIds.length
  console.log(`Migrating ${userIds.length} user(s): ${userIds.join(', ')}`)

  for (const uid of userIds) {
    console.log(`\nUser ${uid}`)
    const context = await buildContextForUser(
      db,
      uid,
      summary,
      artistByMbid,
      artistByNameLower,
      albumByReleaseMbid,
    )
    await remapPlaylistMembers(db, context, summary)
    await remapPipelineAndSessionDocs(db, context, summary)
  }

  return summary
}

async function main() {
  if (process.env.MIGRATE_CONFIRM !== 'yes') {
    console.error('Refusing to run without MIGRATE_CONFIRM=yes')
    console.error('Example: MIGRATE_CONFIRM=yes npm run migrate:catalog')
    process.exit(1)
  }

  console.log(`Catalog migration for ${projectId}`)
  const db = await getAdminDb()
  const summary = await runCatalogMigration(db)
  console.log('\nMigration complete:')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
