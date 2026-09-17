import { getAlbumById, listAlbums } from '@/lib/album/firestore'
import { getArtistById } from '@/lib/artist/firestore'
import {
  fetchLovedTracksPage,
  fetchTrackUserInfo,
  loveTrack,
  scrobbleTrack,
  unloveTrack,
  updateNowPlaying,
} from '@/lib/lastfm/client'
import {
  lastfmLovedKey,
  matchLovedTrack,
  normalizeForLastfm,
  meetsScrobbleThreshold,
} from '@/lib/lastfm/normalize'
import {
  getTrackListenById,
  markListenScrobbled,
  syncTrackLovedFromLastfm,
  syncTrackPlaycountFromLastfm,
} from '@/lib/sessions/firestore'
import { getUserProfile } from '@/lib/userProfile'
import type { Album, PlaylistMember, Track } from '@/types/library'
import type { PlaybackQueueItem } from '@/types/playback'

const LOVED_KEYS_TTL_MS = 5 * 60 * 1000
const LOVED_TRACKS_PAGE_LIMIT = 50
const LOVED_TRACKS_MAX_PAGES = 200

let lovedKeysCache: { username: string; keys: Set<string>; fetchedAt: number } | null = null

async function getLastfmConnection(uid: string) {
  const profile = await getUserProfile(uid)
  if (!profile?.lastfm?.sessionKey) return null
  return profile.lastfm
}

async function getLastfmSession(uid: string): Promise<string | null> {
  return (await getLastfmConnection(uid))?.sessionKey ?? null
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
    const connection = await getLastfmConnection(uid)
    if (connection?.username) {
      await syncPlaycountForTrack(
        uid,
        connection.username,
        listen.trackId,
        artist,
        track,
      )
    }
  } catch (error) {
    console.error('Last.fm scrobble failed', error)
  }
}

async function syncPlaycountForTrack(
  uid: string,
  username: string,
  trackId: string,
  artist: string,
  track: string,
): Promise<void> {
  try {
    const info = await fetchTrackUserInfo(artist, track, username)
    await syncTrackPlaycountFromLastfm(uid, trackId, info.playcount, info.loved)
  } catch (error) {
    console.error('Last.fm playcount sync failed', error)
  }
}

export async function fetchLovedTrackKeys(username: string, force = false): Promise<Set<string>> {
  if (
    !force &&
    lovedKeysCache &&
    lovedKeysCache.username === username &&
    Date.now() - lovedKeysCache.fetchedAt < LOVED_KEYS_TTL_MS
  ) {
    return lovedKeysCache.keys
  }

  const keys = new Set<string>()
  let page = 1
  let totalPages = 1

  while (page <= totalPages && page <= LOVED_TRACKS_MAX_PAGES) {
    const result = await fetchLovedTracksPage(username, page, LOVED_TRACKS_PAGE_LIMIT)
    for (const track of result.tracks) {
      keys.add(lastfmLovedKey(track.artist, track.title))
    }
    totalPages = result.totalPages
    page += 1
  }

  lovedKeysCache = { username, keys, fetchedAt: Date.now() }
  return keys
}

function invalidateLovedKeysCache(): void {
  lovedKeysCache = null
}

async function lovedKeysOrEmpty(username: string, force = false): Promise<Set<string>> {
  try {
    return await fetchLovedTrackKeys(username, force)
  } catch (error) {
    console.error('Last.fm loved tracks fetch failed', error)
    return new Set()
  }
}

async function refreshAlbumPlaycountsWithKeys(
  uid: string,
  album: Album,
  username: string,
  lovedKeys: Set<string>,
): Promise<number> {
  const artist = await resolveScrobbleArtist(uid, album.id, album.artist)
  let synced = 0

  for (const libraryTrack of album.tracks) {
    const track = normalizeForLastfm(libraryTrack.title)
    const bulkLoved = matchLovedTrack(artist, album.artist, track, lovedKeys)
    try {
      const info = await fetchTrackUserInfo(artist, track, username)
      await syncTrackPlaycountFromLastfm(uid, libraryTrack.id, info.playcount, info.loved)
      synced++
    } catch {
      // Only persist a positive loved-list match. A miss must not clear an existing love.
      if (bulkLoved) {
        await syncTrackLovedFromLastfm(uid, libraryTrack.id, true)
      }
    }
  }

  return synced
}

export async function refreshAlbumPlaycounts(uid: string, album: Album): Promise<number> {
  const connection = await getLastfmConnection(uid)
  if (!connection?.username) return 0
  const lovedKeys = await lovedKeysOrEmpty(connection.username)
  return refreshAlbumPlaycountsWithKeys(uid, album, connection.username, lovedKeys)
}

export async function refreshLibraryPlaycounts(uid: string): Promise<number> {
  const connection = await getLastfmConnection(uid)
  if (!connection?.username) return 0

  const albums = await listAlbums(uid)
  const lovedKeys = await lovedKeysOrEmpty(connection.username, true)
  let synced = 0

  for (const album of albums) {
    synced += await refreshAlbumPlaycountsWithKeys(uid, album, connection.username, lovedKeys)
  }

  return synced
}

export async function refreshPlaylistPlaycounts(
  uid: string,
  members: PlaylistMember[],
): Promise<number> {
  const connection = await getLastfmConnection(uid)
  if (!connection?.username) return 0

  const lovedKeys = await lovedKeysOrEmpty(connection.username, true)
  let synced = 0

  for (const member of members) {
    synced += await refreshAlbumPlaycountsWithKeys(
      uid,
      member.album,
      connection.username,
      lovedKeys,
    )
  }

  return synced
}

export async function setTrackLoved(
  uid: string,
  album: Pick<Album, 'id' | 'artist'>,
  track: Pick<Track, 'id' | 'title'>,
  loved: boolean,
): Promise<void> {
  const connection = await getLastfmConnection(uid)
  if (!connection?.sessionKey) {
    throw new Error('Last.fm not connected')
  }

  const artist = await resolveScrobbleArtist(uid, album.id, album.artist)
  const title = normalizeForLastfm(track.title)

  if (loved) {
    await loveTrack(connection.sessionKey, artist, title)
  } else {
    await unloveTrack(connection.sessionKey, artist, title)
  }

  await syncTrackLovedFromLastfm(uid, track.id, loved)
  invalidateLovedKeysCache()
}
