import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import type { PipelineRole, Stage, StageDocument, StarRating } from '@/types/pipeline'

function stagesCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'stages')
}

function toStage(id: string, data: StageDocument): Stage {
  return {
    id,
    pipelineId: data.pipelineId,
    playlistId: data.playlistId,
    name: data.name,
    pipelineRole: data.pipelineRole,
    nextStageId: data.nextStageId,
    terminationStageId: data.terminationStageId,
    outcomeRating: data.outcomeRating,
    createdAt: data.createdAt.toDate(),
  }
}

export async function listStagesByPipeline(uid: string, pipelineId: string): Promise<Stage[]> {
  const snapshot = await getDocs(
    query(stagesCollection(uid), where('pipelineId', '==', pipelineId)),
  )
  return snapshot.docs
    .map((docSnap) => toStage(docSnap.id, docSnap.data() as StageDocument))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getStageById(uid: string, stageId: string): Promise<Stage | null> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'stages', stageId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return toStage(snapshot.id, snapshot.data() as StageDocument)
}

export async function getStageByPlaylistId(
  uid: string,
  playlistId: string,
): Promise<Stage | null> {
  const snapshot = await getDocs(
    query(stagesCollection(uid), where('playlistId', '==', playlistId)),
  )
  if (snapshot.empty) return null
  const docSnap = snapshot.docs[0]
  return toStage(docSnap.id, docSnap.data() as StageDocument)
}

export async function createStage(
  uid: string,
  input: {
    pipelineId: string
    playlistId: string
    name: string
    pipelineRole: PipelineRole
    nextStageId?: string
    terminationStageId?: string
    outcomeRating?: StarRating
  },
): Promise<Stage> {
  const id = crypto.randomUUID()
  const ref = doc(getFirestoreDb(), 'users', uid, 'stages', id)

  await setDoc(
    ref,
    omitUndefined({
      id,
      pipelineId: input.pipelineId,
      playlistId: input.playlistId,
      name: input.name.trim(),
      pipelineRole: input.pipelineRole,
      nextStageId: input.nextStageId,
      terminationStageId: input.terminationStageId,
      outcomeRating: input.outcomeRating,
      createdAt: serverTimestamp(),
    }),
  )

  const created = await getDoc(ref)
  return toStage(created.id, created.data() as StageDocument)
}

export async function updateStage(
  uid: string,
  stageId: string,
  updates: {
    name?: string
    nextStageId?: string
    terminationStageId?: string
    outcomeRating?: StarRating
  },
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'stages', stageId)
  await updateDoc(
    ref,
    omitUndefined({
      name: updates.name?.trim(),
      nextStageId: updates.nextStageId,
      terminationStageId: updates.terminationStageId,
      outcomeRating: updates.outcomeRating,
    }),
  )
}

export async function deleteStage(uid: string, stageId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'stages', stageId)
  await deleteDoc(ref)
}

export async function deleteStagesForPipeline(uid: string, pipelineId: string): Promise<void> {
  const stages = await listStagesByPipeline(uid, pipelineId)
  if (stages.length === 0) return

  const batch = writeBatch(getFirestoreDb())
  for (const stage of stages) {
    batch.delete(doc(getFirestoreDb(), 'users', uid, 'stages', stage.id))
  }
  await batch.commit()
}
