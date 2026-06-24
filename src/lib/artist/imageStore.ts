import { deleteField, doc, updateDoc } from 'firebase/firestore'

import type { ArtistImageUrls } from '@/lib/artist/artistImage'
import { getFirestoreDb } from '@/lib/firebase'
import { omitUndefined } from '@/lib/firestore/sanitize'

export async function setArtistImageUrls(
  uid: string,
  artistId: string,
  urls: ArtistImageUrls,
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'artists', artistId)
  await updateDoc(
    ref,
    omitUndefined({
      imageUrlSmall: urls.small,
      imageUrlLarge: urls.large,
    }),
  )
}

export async function clearArtistImageUrls(uid: string, artistId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'users', uid, 'artists', artistId)
  await updateDoc(ref, {
    imageUrlSmall: deleteField(),
    imageUrlLarge: deleteField(),
  })
}
