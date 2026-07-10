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
import type { Artist, ArtistDocument, ArtistPrefsDocument } from '@/types/library'
import type { MbArtistCredit } from '@/lib/musicbrainz/types'

function artistsCollection() {
  return collection(getFirestoreDb(), 'artists')
}

function artistPrefsCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'artist_prefs')
}

function toArtist(id: string, data: ArtistDocument): Artist {
  return {
    id,
    name: data.name,
    sortName: data.sortName,
    artistMbid: data.artistMbid,
    nameLower: data.nameLower,
    imageUrlSmall: data.imageUrlSmall,
    imageUrlLarge: data.imageUrlLarge,
    importedAt: data.importedAt.toDate(),
    importedBy: data.importedBy,
  }
}

async function getArtistPrefs(uid: string, artistId: string): Promise<ArtistPrefsDocument | null> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'artist_prefs', artistId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return snapshot.data() as ArtistPrefsDocument
}

function withPrefs(artist: Artist, prefs: ArtistPrefsDocument | null): Artist {
  return {
    ...artist,
    scrobbleName: prefs?.scrobbleName,
    preferredYouTubeChannelId: prefs?.preferredYouTubeChannelId,
    preferredYouTubeChannelTitle: prefs?.preferredYouTubeChannelTitle,
  }
}

async function findArtistByMbid(artistMbid: string): Promise<Artist | null> {
  const snapshot = await getDocs(query(artistsCollection(), where('artistMbid', '==', artistMbid)))
  if (snapshot.empty) return null
  const docSnap = snapshot.docs[0]
  return toArtist(docSnap.id, docSnap.data() as ArtistDocument)
}

async function findArtistByNameLower(nameLower: string): Promise<Artist | null> {
  const snapshot = await getDocs(query(artistsCollection(), where('nameLower', '==', nameLower)))
  if (snapshot.empty) return null
  const docSnap = snapshot.docs[0]
  return toArtist(docSnap.id, docSnap.data() as ArtistDocument)
}

async function findOrCreateArtist(seed: ArtistSeedInput, importedBy: string): Promise<Artist> {
  if (seed.artistMbid) {
    const byMbid = await findArtistByMbid(seed.artistMbid)
    if (byMbid) return byMbid
  }

  const nameLower = normalizeArtistName(seed.name)
  const byName = await findArtistByNameLower(nameLower)
  if (byName) return byName

  const id = crypto.randomUUID()
  const artist: Omit<Artist, 'importedAt' | 'importedBy'> = {
    id,
    name: seed.name,
    sortName: seed.sortName,
    artistMbid: seed.artistMbid,
    nameLower,
  }

  const ref = doc(getFirestoreDb(), 'artists', id)
  await setDoc(
    ref,
    omitUndefined({
      ...toArtistDocumentFields(artist),
      importedAt: serverTimestamp(),
      importedBy,
    }),
  )

  const created = await getDoc(ref)
  const importedAt = created.data()?.importedAt as Timestamp | undefined

  return {
    ...artist,
    importedAt: importedAt?.toDate() ?? new Date(),
    importedBy,
  }
}

export async function findOrCreateArtistsFromCredits(
  uid: string,
  credits: MbArtistCredit[] | undefined,
): Promise<Artist[]> {
  void uid
  const seeds = artistSeedsFromCredits(credits)
  const seen = new Set<string>()
  const artists: Artist[] = []

  for (const seed of seeds) {
    const key = artistDedupeKey(seed)
    if (seen.has(key)) continue
    seen.add(key)
    artists.push(await findOrCreateArtist(seed, uid))
  }

  return artists
}

export async function getArtistById(uid: string, artistId: string): Promise<Artist | null> {
  const ref = doc(getFirestoreDb(), 'artists', artistId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  const artist = toArtist(snapshot.id, snapshot.data() as ArtistDocument)
  const prefs = await getArtistPrefs(uid, artistId)
  return withPrefs(artist, prefs)
}

export async function listArtists(uid: string): Promise<Artist[]> {
  const snapshot = await getDocs(artistsCollection())
  const base = snapshot.docs
    .map((docSnap) => toArtist(docSnap.id, docSnap.data() as ArtistDocument))
    .sort((a, b) => a.name.localeCompare(b.name))

  const prefsSnapshot = await getDocs(artistPrefsCollection(uid))
  const prefsByArtistId = new Map(
    prefsSnapshot.docs.map((docSnap) => [docSnap.id, docSnap.data() as ArtistPrefsDocument]),
  )

  return base.map((artist) => withPrefs(artist, prefsByArtistId.get(artist.id) ?? null))
}

export async function setArtistPreferredYouTubeChannel(
  uid: string,
  artistId: string,
  channel: { channelId: string; channelTitle: string },
): Promise<Artist> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'artist_prefs', artistId)
  await setDoc(
    ref,
    omitUndefined({
      artistId,
      preferredYouTubeChannelId: channel.channelId,
      preferredYouTubeChannelTitle: channel.channelTitle,
    }),
    { merge: true },
  )

  const updated = await getArtistById(uid, artistId)
  if (!updated) {
    throw new Error('Artist not found')
  }
  return updated
}

export async function setArtistScrobbleName(
  uid: string,
  artistId: string,
  scrobbleName: string,
): Promise<Artist> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'artist_prefs', artistId)
  const trimmed = scrobbleName.trim()
  await setDoc(
    ref,
    trimmed
      ? { artistId, scrobbleName: trimmed }
      : { artistId, scrobbleName: deleteField() },
    { merge: true },
  )

  const updated = await getArtistById(uid, artistId)
  if (!updated) {
    throw new Error('Artist not found')
  }
  return updated
}

export async function clearArtistPreferredYouTubeChannel(uid: string, artistId: string): Promise<Artist> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'artist_prefs', artistId)
  await updateDoc(ref, {
    preferredYouTubeChannelId: deleteField(),
    preferredYouTubeChannelTitle: deleteField(),
  })

  const updated = await getArtistById(uid, artistId)
  if (!updated) {
    throw new Error('Artist not found')
  }
  return updated
}
