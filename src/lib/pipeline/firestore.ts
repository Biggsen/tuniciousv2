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
} from 'firebase/firestore'

import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import type { Pipeline, PipelineDocument, PipelineTemplateId } from '@/types/pipeline'

function pipelinesCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'pipelines')
}

function toPipeline(id: string, data: PipelineDocument): Pipeline {
  return {
    id,
    name: data.name,
    templateId: data.templateId,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  }
}

export async function listPipelines(uid: string): Promise<Pipeline[]> {
  const snapshot = await getDocs(pipelinesCollection(uid))
  return snapshot.docs
    .map((docSnap) => toPipeline(docSnap.id, docSnap.data() as PipelineDocument))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function getPipelineById(uid: string, pipelineId: string): Promise<Pipeline | null> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'pipelines', pipelineId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return toPipeline(snapshot.id, snapshot.data() as PipelineDocument)
}

export async function getEvaluationPipeline(uid: string): Promise<Pipeline | null> {
  const snapshot = await getDocs(
    query(pipelinesCollection(uid), where('templateId', '==', 'evaluation')),
  )
  if (snapshot.empty) return null
  const docSnap = snapshot.docs[0]
  return toPipeline(docSnap.id, docSnap.data() as PipelineDocument)
}

export async function createPipeline(
  uid: string,
  input: { name: string; templateId?: PipelineTemplateId },
): Promise<Pipeline> {
  const id = crypto.randomUUID()
  const ref = doc(getFirestoreDb(), 'users', uid, 'pipelines', id)
  const now = serverTimestamp()

  await setDoc(
    ref,
    omitUndefined({
      id,
      name: input.name.trim(),
      templateId: input.templateId,
      createdAt: now,
      updatedAt: now,
    }),
  )

  const created = await getDoc(ref)
  return toPipeline(created.id, created.data() as PipelineDocument)
}

export async function updatePipeline(
  uid: string,
  pipelineId: string,
  updates: { name?: string },
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'pipelines', pipelineId)
  await updateDoc(
    ref,
    omitUndefined({
      name: updates.name?.trim(),
      updatedAt: serverTimestamp(),
    }),
  )
}

export async function deletePipeline(uid: string, pipelineId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'pipelines', pipelineId)
  await deleteDoc(ref)
}
