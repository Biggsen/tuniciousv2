import {
  collection,
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
import type { PipelineRole, StageMembership, StageMembershipDocument } from '@/types/pipeline'

function stageMembershipsCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'stage_memberships')
}

function toStageMembership(id: string, data: StageMembershipDocument): StageMembership {
  return {
    id,
    albumId: data.albumId,
    pipelineId: data.pipelineId,
    stageId: data.stageId,
    pipelineRole: data.pipelineRole,
    addedAt: data.addedAt.toDate(),
    removedAt: data.removedAt?.toDate(),
  }
}

export function isMembershipOpen(membership: StageMembership): boolean {
  return membership.removedAt === undefined
}

export async function getStageMembershipById(
  uid: string,
  membershipId: string,
): Promise<StageMembership | null> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'stage_memberships', membershipId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return toStageMembership(snapshot.id, snapshot.data() as StageMembershipDocument)
}

export async function getOpenMembershipForAlbumPipeline(
  uid: string,
  albumId: string,
  pipelineId: string,
): Promise<StageMembership | null> {
  const snapshot = await getDocs(
    query(
      stageMembershipsCollection(uid),
      where('albumId', '==', albumId),
      where('pipelineId', '==', pipelineId),
      where('removedAt', '==', null),
    ),
  )
  if (snapshot.empty) return null
  const docSnap = snapshot.docs[0]
  return toStageMembership(docSnap.id, docSnap.data() as StageMembershipDocument)
}

export async function listOpenMembershipsForPipeline(
  uid: string,
  pipelineId: string,
): Promise<StageMembership[]> {
  const snapshot = await getDocs(
    query(
      stageMembershipsCollection(uid),
      where('pipelineId', '==', pipelineId),
      where('removedAt', '==', null),
    ),
  )
  return snapshot.docs.map((docSnap) =>
    toStageMembership(docSnap.id, docSnap.data() as StageMembershipDocument),
  )
}

export async function listOpenMembershipsForAlbum(
  uid: string,
  albumId: string,
): Promise<StageMembership[]> {
  const snapshot = await getDocs(
    query(
      stageMembershipsCollection(uid),
      where('albumId', '==', albumId),
      where('removedAt', '==', null),
    ),
  )
  return snapshot.docs.map((docSnap) =>
    toStageMembership(docSnap.id, docSnap.data() as StageMembershipDocument),
  )
}

export async function listMembershipHistoryForAlbumPipeline(
  uid: string,
  albumId: string,
  pipelineId: string,
): Promise<StageMembership[]> {
  const snapshot = await getDocs(
    query(
      stageMembershipsCollection(uid),
      where('albumId', '==', albumId),
      where('pipelineId', '==', pipelineId),
    ),
  )
  return snapshot.docs
    .map((docSnap) => toStageMembership(docSnap.id, docSnap.data() as StageMembershipDocument))
    .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
}

export async function listMembershipsForAlbum(
  uid: string,
  albumId: string,
): Promise<StageMembership[]> {
  const snapshot = await getDocs(
    query(stageMembershipsCollection(uid), where('albumId', '==', albumId)),
  )
  return snapshot.docs
    .map((docSnap) => toStageMembership(docSnap.id, docSnap.data() as StageMembershipDocument))
    .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())
}

export async function openStageMembership(
  uid: string,
  input: {
    albumId: string
    pipelineId: string
    stageId: string
    pipelineRole: PipelineRole
  },
): Promise<StageMembership> {
  const id = crypto.randomUUID()
  const ref = doc(getFirestoreDb(), 'users', uid, 'stage_memberships', id)

  await setDoc(ref, {
    id,
    albumId: input.albumId,
    pipelineId: input.pipelineId,
    stageId: input.stageId,
    pipelineRole: input.pipelineRole,
    addedAt: serverTimestamp(),
    removedAt: null,
  })

  const created = await getDoc(ref)
  return toStageMembership(created.id, created.data() as StageMembershipDocument)
}

export async function closeStageMembership(uid: string, membershipId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'stage_memberships', membershipId)
  await updateDoc(ref, { removedAt: serverTimestamp() })
}

export async function reopenStageMembership(uid: string, membershipId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'stage_memberships', membershipId)
  await updateDoc(ref, { removedAt: null })
}

export async function closeOpenMembershipsForAlbumPipeline(
  uid: string,
  albumId: string,
  pipelineId: string,
  exceptMembershipId?: string,
): Promise<void> {
  const open = await getOpenMembershipForAlbumPipeline(uid, albumId, pipelineId)
  if (!open || open.id === exceptMembershipId) return
  await closeStageMembership(uid, open.id)
}

export async function closeAllOpenMembershipsForPipeline(
  uid: string,
  pipelineId: string,
): Promise<void> {
  const openMemberships = await listOpenMembershipsForPipeline(uid, pipelineId)
  await Promise.all(openMemberships.map((membership) => closeStageMembership(uid, membership.id)))
}
