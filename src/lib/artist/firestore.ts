import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'

import {
  artistDedupeKey,
  artistSeedsFromCredits,
  toArtistDocumentFields,
  type ArtistSeedInput,
} from '@/lib/artist/seedFromCredits'
import { normalizeArtistName } from '@/lib/artist/normalize'
import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'
import type { Artist, ArtistDocument } from '@/types/library'
import type { MbArtistCredit } from '@/lib/musicbrainz/types'

function toArtist(id: string, data: ArtistDocument): Artist {
  return {
    id,
    name: data.name,
    sortName: data.sortName,
    artistMbid: data.artistMbid,
    scrobbleName: data.scrobbleName,
    nameLower: data.nameLower,
    preferredYouTubeChannelId: data.preferredYouTubeChannelId,
    preferredYouTubeChannelTitle: data.preferredYouTubeChannelTitle,
    importedAt: data.importedAt.toDate(),
  }
}

function artistsCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'artists')
}

async function findArtistByMbid(uid: string, artistMbid: string): Promise<Artist | null> {
  const snapshot = await getDocs(
    query(artistsCollection(uid), where('artistMbid', '==', artistMbid)),
  )
  if (snapshot.empty) return null
  const docSnap = snapshot.docs[0]
  return toArtist(docSnap.id, docSnap.data() as ArtistDocument)
}

async function findArtistByNameLower(uid: string, nameLower: string): Promise<Artist | null> {
  const snapshot = await getDocs(
    query(artistsCollection(uid), where('nameLower', '==', nameLower)),
  )
  if (snapshot.empty) return null
  const docSnap = snapshot.docs[0]
  return toArtist(docSnap.id, docSnap.data() as ArtistDocument)
}

async function findOrCreateArtist(uid: string, seed: ArtistSeedInput): Promise<Artist> {
  if (seed.artistMbid) {
    const byMbid = await findArtistByMbid(uid, seed.artistMbid)
    if (byMbid) return byMbid
  }

  const nameLower = normalizeArtistName(seed.name)
  const byName = await findArtistByNameLower(uid, nameLower)
  if (byName) return byName

  const id = crypto.randomUUID()
  const artist: Omit<Artist, 'importedAt'> = {
    id,
    name: seed.name,
    sortName: seed.sortName,
    artistMbid: seed.artistMbid,
    nameLower,
  }

  const ref = doc(getFirestoreDb(), 'users', uid, 'artists', id)
  await setDoc(
    ref,
    omitUndefined({
      ...toArtistDocumentFields(artist),
      importedAt: serverTimestamp(),
    }),
  )

  const created = await getDoc(ref)
  const importedAt = created.data()?.importedAt as Timestamp | undefined

  return {
    ...artist,
    importedAt: importedAt?.toDate() ?? new Date(),
  }
}

export async function findOrCreateArtistsFromCredits(
  uid: string,
  credits: MbArtistCredit[] | undefined,
): Promise<Artist[]> {
  const seeds = artistSeedsFromCredits(credits)
  const seen = new Set<string>()
  const artists: Artist[] = []

  for (const seed of seeds) {
    const key = artistDedupeKey(seed)
    if (seen.has(key)) continue
    seen.add(key)
    artists.push(await findOrCreateArtist(uid, seed))
  }

  return artists
}

export async function getArtistById(uid: string, artistId: string): Promise<Artist | null> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'artists', artistId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return toArtist(snapshot.id, snapshot.data() as ArtistDocument)
}

export async function listArtists(uid: string): Promise<Artist[]> {
  const snapshot = await getDocs(artistsCollection(uid))
  return snapshot.docs
    .map((docSnap) => toArtist(docSnap.id, docSnap.data() as ArtistDocument))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function setArtistPreferredYouTubeChannel(
  uid: string,
  artistId: string,
  channel: { channelId: string; channelTitle: string },
): Promise<Artist> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'artists', artistId)
  await updateDoc(
    ref,
    omitUndefined({
      preferredYouTubeChannelId: channel.channelId,
      preferredYouTubeChannelTitle: channel.channelTitle,
    }),
  )

  const updated = await getDoc(ref)
  if (!updated.exists()) {
    throw new Error('Artist not found')
  }

  return toArtist(updated.id, updated.data() as ArtistDocument)
}

export async function clearArtistPreferredYouTubeChannel(uid: string, artistId: string): Promise<Artist> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'artists', artistId)
  await updateDoc(ref, {
    preferredYouTubeChannelId: deleteField(),
    preferredYouTubeChannelTitle: deleteField(),
  })

  const updated = await getDoc(ref)
  if (!updated.exists()) {
    throw new Error('Artist not found')
  }

  return toArtist(updated.id, updated.data() as ArtistDocument)
}
