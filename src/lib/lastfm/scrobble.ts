import { getAlbumById, listAlbums } from '@/lib/album/firestore'
import { getArtistById } from '@/lib/artist/firestore'
import {
  fetchTrackPlaycount,
  scrobbleTrack,
  updateNowPlaying,
} from '@/lib/lastfm/client'
import { normalizeForLastfm, meetsScrobbleThreshold } from '@/lib/lastfm/normalize'
import {
  getTrackListenById,
  markListenScrobbled,
  syncTrackPlaycountFromLastfm,
} from '@/lib/sessions/firestore'
import { getUserProfile } from '@/lib/userProfile'
import type { PlaybackQueueItem } from '@/types/playback'

async function getLastfmSession(uid: string): Promise<string | null> {
  const profile = await getUserProfile(uid)
  if (!profile?.lastfm?.sessionKey) return null
  return profile.lastfm.sessionKey
}

export async function isLastfmConnected(uid: string): Promise<boolean> {
  return (await getLastfmSession(uid)) !== null
}

export async function resolveScrobbleArtist(
  uid: string,
  albumId: string,
  fallbackArtist: string,
): Promise<string> {
  const album = await getAlbumById(uid, albumId)
  if (album?.artistId) {
    const artist = await getArtistById(uid, album.artistId)
    if (artist?.scrobbleName) return normalizeForLastfm(artist.scrobbleName)
    if (artist?.name) return normalizeForLastfm(artist.name)
  }
  return normalizeForLastfm(fallbackArtist)
}

export async function handleTrackStarted(
  uid: string,
  item: PlaybackQueueItem,
  trackLengthMs?: number,
): Promise<void> {
  const sessionKey = await getLastfmSession(uid)
  if (!sessionKey) return

  try {
    const artist = await resolveScrobbleArtist(uid, item.albumId, item.artist)
    const track = normalizeForLastfm(item.title)
    await updateNowPlaying(
      sessionKey,
      artist,
      track,
      normalizeForLastfm(item.albumTitle),
      trackLengthMs,
    )
  } catch (error) {
    console.error('Last.fm now playing failed', error)
  }
}

export async function handleListenFinalized(uid: string, listenId: string): Promise<void> {
  const sessionKey = await getLastfmSession(uid)
  if (!sessionKey) return

  const listen = await getTrackListenById(uid, listenId)
  if (!listen || listen.scrobbled) return
  if (!meetsScrobbleThreshold(listen.listenedMs, listen.trackLengthMs)) return

  try {
    const artist = await resolveScrobbleArtist(uid, listen.albumId, listen.artist)
    const track = normalizeForLastfm(listen.title)
    const timestamp = Math.floor(listen.startedAt.getTime() / 1000)

    await scrobbleTrack(
      sessionKey,
      artist,
      track,
      timestamp,
      normalizeForLastfm(listen.albumTitle),
      listen.trackLengthMs,
    )
    await markListenScrobbled(uid, listenId)
    await syncPlaycountForTrack(uid, sessionKey, listen.trackId, artist, track)
  } catch (error) {
    console.error('Last.fm scrobble failed', error)
  }
}

async function syncPlaycountForTrack(
  uid: string,
  sessionKey: string,
  trackId: string,
  artist: string,
  track: string,
): Promise<void> {
  try {
    const playcount = await fetchTrackPlaycount(sessionKey, artist, track)
    await syncTrackPlaycountFromLastfm(uid, trackId, playcount)
  } catch (error) {
    console.error('Last.fm playcount sync failed', error)
  }
}

export async function refreshLibraryPlaycounts(uid: string): Promise<number> {
  const sessionKey = await getLastfmSession(uid)
  if (!sessionKey) return 0

  const albums = await listAlbums(uid)
  let synced = 0

  for (const album of albums) {
    const artist = await resolveScrobbleArtist(uid, album.id, album.artist)

    for (const libraryTrack of album.tracks) {
      try {
        const track = normalizeForLastfm(libraryTrack.title)
        const playcount = await fetchTrackPlaycount(sessionKey, artist, track)
        await syncTrackPlaycountFromLastfm(uid, libraryTrack.id, playcount)
        synced++
      } catch {
        // Skip tracks Last.fm cannot match.
      }
    }
  }

  return synced
}
