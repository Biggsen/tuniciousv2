/**
 * Phase 0 Firestore backup.
 * Uses Firebase CLI credentials (run `firebase login` first).
 *
 * Tries GCS export first; falls back to a local JSON dump if export fails.
 */
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const firebaseToolsRoot = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'firebase-tools')
const { requireAuth } = require(path.join(firebaseToolsRoot, 'lib/requireAuth'))
const { getGlobalDefaultAccount, setActiveAccount } = require(path.join(firebaseToolsRoot, 'lib/auth'))
const firestore = require(path.join(firebaseToolsRoot, 'lib/gcp/firestore'))
const { Client } = require(path.join(firebaseToolsRoot, 'lib/apiv2'))
const { firestoreOrigin } = require(path.join(firebaseToolsRoot, 'lib/api'))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectId = process.env.FIREBASE_PROJECT_ID ?? 'tunicious-40e1b'
const stamp = new Date().toISOString().slice(0, 10)
const backupRoot = path.resolve(__dirname, '..', 'backups', `firestore-${stamp}`)
const docsDir = path.join(backupRoot, 'docs')

const options = {
  project: projectId,
  projectId,
  interactive: false,
  nonInteractive: true,
}

const visited = new Set()
const index = []

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function documentPathFromName(name) {
  const marker = '/documents/'
  const idx = name.indexOf(marker)
  return idx === -1 ? name : name.slice(idx + marker.length)
}

function hashPath(documentPath) {
  return crypto.createHash('sha256').update(documentPath).digest('hex')
}

async function authenticate() {
  const account = getGlobalDefaultAccount()
  if (!account) {
    throw new Error('Not logged in. Run `firebase login` first.')
  }
  setActiveAccount(options, account)
  const email = await requireAuth(options)
  console.log(`Authenticated as ${email ?? account.user.email}`)
  return email ?? account.user.email
}

async function pollOperation(operationName, maxAttempts = 120) {
  const client = new Client({
    auth: true,
    apiVersion: 'v1',
    urlPrefix: firestoreOrigin(),
  })

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await client.get(operationName)
    const op = res.body
    if (op.done) {
      if (op.error) {
        throw new Error(`Export failed: ${JSON.stringify(op.error)}`)
      }
      return op
    }
    process.stdout.write('.')
    await sleep(5000)
  }
  throw new Error(`Export timed out after ${maxAttempts} attempts`)
}

async function tryGcsExport() {
  await authenticate()

  const bucketCandidates = [
    `${projectId}.appspot.com`,
    `${projectId}.firebasestorage.app`,
  ]

  const client = new Client({
    auth: true,
    apiVersion: 'v1',
    urlPrefix: firestoreOrigin(),
  })

  let lastError
  for (const bucket of bucketCandidates) {
    const outputUriPrefix = `gs://${bucket}/backups/pre-catalog-migration-${stamp}`
    console.log(`Trying GCS export to ${outputUriPrefix}`)
    try {
      const res = await client.post(`projects/${projectId}/databases/(default):exportDocuments`, {
        outputUriPrefix,
      })
      const operationName = res.body.name
      if (!operationName) {
        throw new Error(`Unexpected export response: ${JSON.stringify(res.body)}`)
      }
      console.log(`Export operation: ${operationName}`)
      process.stdout.write('Waiting')
      const completed = await pollOperation(operationName)
      console.log('\nGCS export complete.')

      const manifest = {
        type: 'gcs-export',
        projectId,
        outputUriPrefix,
        operationName,
        completedAt: new Date().toISOString(),
        response: completed.response ?? null,
      }
      await fs.mkdir(backupRoot, { recursive: true })
      await fs.writeFile(path.join(backupRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))
      return manifest
    } catch (error) {
      lastError = error
      console.warn(`Bucket ${bucket} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw lastError ?? new Error('GCS export failed for all bucket candidates')
}

const COLLECTION_GROUPS = [
  'albums',
  'artists',
  'playlists',
  'album_picker',
  'stage_memberships',
  'playback_sessions',
  'track_listens',
  'track_stats',
  'members',
  'youtube_mappings',
  'artist_prefs',
]

async function queryCollectionGroup(collectionId) {
  const client = new Client({
    auth: true,
    apiVersion: 'v1',
    urlPrefix: firestoreOrigin(),
  })
  const url = `projects/${projectId}/databases/(default)/documents:runQuery`

  const documents = []
  let pageToken
  do {
    const body = {
      structuredQuery: {
        from: [{ collectionId, allDescendants: true }],
      },
    }
    if (pageToken) body.pageToken = pageToken
    const res = await client.post(url, body)
    pageToken = undefined
    for (const row of res.body ?? []) {
      if (row.document) documents.push(row.document)
      if (row.nextPageToken) pageToken = row.nextPageToken
    }
  } while (pageToken)

  return documents
}

async function writeLocalDocument(documentPath, data) {
  const fileName = `${hashPath(documentPath)}.json`
  const filePath = path.join(docsDir, fileName)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
  index.push({ path: documentPath, file: `docs/${fileName}` })
}

async function backupDocumentTree(documentPath, data) {
  if (visited.has(documentPath)) return
  visited.add(documentPath)
  await writeLocalDocument(documentPath, data)
}

async function localJsonBackup() {
  await authenticate()
  console.log(`Writing local JSON backup to ${backupRoot}`)

  await fs.mkdir(docsDir, { recursive: true })
  const counts = {}

  const topLevelUsers = await firestore.listCollectionIds(projectId)
  if (topLevelUsers.includes('users')) {
    const userDocs = await queryCollectionGroup('users')
    const rootUsers = userDocs.filter((doc) => documentPathFromName(doc.name).split('/').length === 2)
    for (const doc of rootUsers) {
      const documentPath = documentPathFromName(doc.name)
      await backupDocumentTree(documentPath, doc)
    }
    counts.users = rootUsers.length
  }

  for (const collectionId of COLLECTION_GROUPS) {
    const documents = await queryCollectionGroup(collectionId)
    counts[collectionId] = documents.length
    console.log(`Backing up ${collectionId}: ${documents.length} documents`)
    for (const doc of documents) {
      const documentPath = documentPathFromName(doc.name)
      await backupDocumentTree(documentPath, doc)
    }
  }

  const manifest = {
    type: 'local-json',
    projectId,
    backupRoot,
    counts: {
      ...counts,
      totalDocuments: visited.size,
    },
    completedAt: new Date().toISOString(),
  }
  await fs.writeFile(path.join(backupRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await fs.writeFile(path.join(backupRoot, 'index.json'), JSON.stringify(index, null, 2))
  return manifest
}

async function main() {
  console.log(`Firestore backup for ${projectId}`)
  try {
    const manifest = await tryGcsExport()
    console.log(JSON.stringify(manifest, null, 2))
    return
  } catch (error) {
    console.warn(`GCS export failed: ${error instanceof Error ? error.message : String(error)}`)
    console.warn('Falling back to local JSON backup...')
  }

  const manifest = await localJsonBackup()
  console.log(JSON.stringify(manifest, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
