/**
 * Upload v1 pipeline export into Firestore staging for the migration UI.
 *
 * Usage:
 *   node scripts/upload-v1-migration.mjs
 *
 * Defaults to the jnWUc… export, group "new", and uid-map → v2 user.
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
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
const exportRoot =
  process.env.V1_EXPORT_DIR ??
  path.join(__dirname, '../resources/exports_v1/v1-pipeline-2026-07-10')
const group = process.env.V1_MIGRATION_GROUP ?? 'new'
const BATCH_LIMIT = 400

const options = {
  project: projectId,
  projectId,
  interactive: false,
  nonInteractive: true,
}

async function getAdminDb() {
  const account = getGlobalDefaultAccount()
  if (!account) throw new Error('Not logged in. Run `firebase login` first.')
  setActiveAccount(options, account)
  const email = await requireAuth(options)
  console.log(`Authenticated as ${email ?? account.user.email}`)
  process.env.GOOGLE_APPLICATION_CREDENTIALS = await defaultCredentials.getCredentialPathAsync(account)
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId })
  }
  return getFirestore()
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

async function main() {
  const uidMap = loadJson(path.join(exportRoot, 'uid-map.json'))
  const v1Uid = Object.keys(uidMap)[0]
  const v2Uid = uidMap[v1Uid]
  if (!v1Uid || !v2Uid) throw new Error('uid-map.json missing mapping')

  const userDir = path.join(exportRoot, v1Uid)
  const albums = loadJson(path.join(userDir, 'albums.json'))
  const playlistMap = loadJson(path.join(userDir, `playlist-id-map-${group}.json`))
  const spotifyIds = new Set(Object.keys(playlistMap.stages ?? {}))

  const filtered = albums.filter((album) =>
    (album.playlistHistory ?? []).some(
      (entry) => entry.type === group || spotifyIds.has(entry.playlistId),
    ),
  )

  console.log(`Uploading group="${group}" for v1=${v1Uid} → v2=${v2Uid}`)
  console.log(`Albums in export: ${albums.length}; matching group: ${filtered.length}`)

  const db = await getAdminDb()
  const col = db.collection('users').doc(v2Uid).collection('v1_migration_albums')

  let written = 0
  for (let i = 0; i < filtered.length; i += BATCH_LIMIT) {
    const chunk = filtered.slice(i, i + BATCH_LIMIT)
    const batch = db.batch()
    for (const album of chunk) {
      const ref = col.doc(album.v1AlbumId)
      batch.set(
        ref,
        {
          v1AlbumId: album.v1AlbumId,
          albumTitle: album.albumTitle,
          artistName: album.artistName,
          releaseYear: album.releaseYear ?? null,
          albumCover: album.albumCover ?? null,
          playlistHistory: album.playlistHistory ?? [],
          extras: album.extras ?? null,
          migration: {
            status: 'pending',
          },
        },
        { merge: true },
      )
      written++
    }
    await batch.commit()
    console.log(`  wrote ${Math.min(i + chunk.length, filtered.length)} / ${filtered.length}`)
  }

  await db.collection('users').doc(v2Uid).collection('v1_migration').doc('meta').set({
    v1Uid,
    v2Uid,
    group,
    v2PipelineId: playlistMap.v2PipelineId ?? null,
    albumCount: filtered.length,
    sourceExport: path.relative(path.join(__dirname, '..'), userDir).replaceAll('\\', '/'),
    uploadedAt: FieldValue.serverTimestamp(),
  })

  await db
    .collection('users')
    .doc(v2Uid)
    .collection('v1_migration')
    .doc(`playlist_map_${group}`)
    .set(playlistMap)

  console.log(`Done. Staged ${written} albums + meta + playlist_map_${group}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
