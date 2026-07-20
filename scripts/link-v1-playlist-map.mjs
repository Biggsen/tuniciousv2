/**
 * Fill playlist-id-map-{group}.json with v2 pipeline / stage / playlist IDs
 * from Firestore (same prep New received after funnel setup).
 *
 * Usage:
 *   node scripts/link-v1-playlist-map.mjs --group=known
 *   node scripts/link-v1-playlist-map.mjs --group=known --pipeline=Known
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
const { getFirestore } = require('firebase-admin/firestore')

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'tunicious-40e1b'
const exportRoot =
  process.env.V1_EXPORT_DIR ??
  path.join(__dirname, '../resources/exports_v1/v1-pipeline-2026-07-10')
const groupArg = process.argv.find((arg) => arg.startsWith('--group='))?.split('=')[1]
const pipelineNameArg = process.argv.find((arg) => arg.startsWith('--pipeline='))?.split('=')[1]
const group = groupArg ?? process.env.V1_MIGRATION_GROUP ?? 'known'
const preferredPipelineName = (pipelineNameArg ?? group).trim()

if (group !== 'new' && group !== 'known') {
  throw new Error(`Invalid group "${group}". Use new or known.`)
}

const options = {
  project: projectId,
  projectId,
  interactive: false,
  nonInteractive: true,
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
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

async function main() {
  const uidMap = loadJson(path.join(exportRoot, 'uid-map.json'))
  const v1Uid = Object.keys(uidMap)[0]
  const v2Uid = uidMap[v1Uid]
  if (!v1Uid || !v2Uid) throw new Error('uid-map.json missing mapping')

  const mapPath = path.join(exportRoot, v1Uid, `playlist-id-map-${group}.json`)
  if (!fs.existsSync(mapPath)) throw new Error(`Missing ${mapPath}`)
  const playlistMap = loadJson(mapPath)

  const db = await getAdminDb()
  const pipelinesSnap = await db.collection('users').doc(v2Uid).collection('pipelines').get()
  const evaluationPipelines = pipelinesSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((pipeline) => pipeline.templateId === 'evaluation')

  let pipeline =
    evaluationPipelines.find(
      (item) => normalizeName(item.name) === normalizeName(preferredPipelineName),
    ) ?? null

  if (!pipeline && evaluationPipelines.length === 1) {
    pipeline = evaluationPipelines[0]
  }

  if (!pipeline) {
    const names = evaluationPipelines.map((item) => item.name).join(', ') || '(none)'
    throw new Error(
      `No evaluation pipeline named "${preferredPipelineName}". Found: ${names}. Pass --pipeline=Name`,
    )
  }

  const stagesSnap = await db
    .collection('users')
    .doc(v2Uid)
    .collection('stages')
    .where('pipelineId', '==', pipeline.id)
    .get()

  const stagesByName = new Map()
  for (const docSnap of stagesSnap.docs) {
    const data = docSnap.data()
    stagesByName.set(normalizeName(data.name), {
      v2StageId: docSnap.id,
      v2PlaylistId: data.playlistId,
      v2StageName: data.name,
    })
  }

  const warnings = []
  let linked = 0
  for (const [v1PlaylistId, stage] of Object.entries(playlistMap.stages ?? {})) {
    const match = stagesByName.get(normalizeName(stage.inferredName))
    if (!match?.v2StageId || !match?.v2PlaylistId) {
      warnings.push(`No v2 stage for “${stage.inferredName}” (${v1PlaylistId})`)
      continue
    }
    stage.v2StageId = match.v2StageId
    stage.v2PlaylistId = match.v2PlaylistId
    stage.v2StageName = match.v2StageName
    linked++
  }

  playlistMap.v1Uid = v1Uid
  playlistMap.v2Uid = v2Uid
  playlistMap.v2PipelineId = pipeline.id
  playlistMap.v2PipelineName = pipeline.name
  playlistMap.group = group
  playlistMap.linkedAt = new Date().toISOString()
  playlistMap.warnings = warnings

  fs.writeFileSync(mapPath, `${JSON.stringify(playlistMap, null, 2)}\n`, 'utf8')

  console.log(`Pipeline: ${pipeline.name} (${pipeline.id})`)
  console.log(`Linked ${linked} / ${Object.keys(playlistMap.stages ?? {}).length} stages`)
  if (warnings.length) {
    console.warn('Warnings:')
    for (const warning of warnings) console.warn(`  - ${warning}`)
  }
  console.log(`Wrote ${path.relative(path.join(__dirname, '..'), mapPath)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
