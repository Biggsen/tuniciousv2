import { setAlbumYouTubePlaylist } from '@/lib/album/firestore'
import {
  getPlaylistById,
  listPlaylistVideos,
  searchPlaylists,
} from '@/lib/youtube/client'
import { saveTrackMapping } from '@/lib/youtube/firestore'
import { matchTracksToPlaylistVideos, normalizeTrackTitle } from '@/lib/youtube/match'
import type { Album, Track } from '@/types/library'
import type { ArtistResolveContext, YouTubePlaylistCandidate } from '@/types/youtube'

export class PlaylistResolveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlaylistResolveError'
  }
}

function buildPlaylistSearchQuery(artistName: string, albumTitle: string): string {
  return `${artistName} ${albumTitle}`.trim()
}

function scorePlaylistCandidate(
  playlist: YouTubePlaylistCandidate,
  albumTitle: string,
  trackCount: number,
  preferredChannelId?: string,
): number {
  let score = 0
  const albumNorm = normalizeTrackTitle(albumTitle)
  const playlistNorm = normalizeTrackTitle(playlist.title)

  if (playlistNorm === albumNorm) {
    score += 100
  } else if (playlistNorm.includes(albumNorm) || albumNorm.includes(playlistNorm)) {
    score += 60
  }

  if (playlist.channelTitle.toLowerCase().includes('topic')) {
    score += 40
  }

  if (preferredChannelId && playlist.channelId === preferredChannelId) {
    score += 80
  }

  if (playlist.itemCount !== undefined) {
    const diff = Math.abs(playlist.itemCount - trackCount)
    score += Math.max(0, 30 - diff * 5)
  }

  return score
}

export async function findTopicPlaylistForAlbum(
  artistName: string,
  album: Album,
  preferredChannelId?: string,
): Promise<YouTubePlaylistCandidate | null> {
  const query = buildPlaylistSearchQuery(artistName, album.title)
  const seen = new Set<string>()
  let candidates: YouTubePlaylistCandidate[] = []

  if (preferredChannelId) {
    candidates = await searchPlaylists(query, 10, preferredChannelId)
  }

  for (const playlist of await searchPlaylists(query, 10)) {
    if (seen.has(playlist.playlistId)) continue
    seen.add(playlist.playlistId)
    candidates.push(playlist)
  }

  if (!candidates.length) {
    const topicQuery = `${artistName} Topic ${album.title}`
    for (const playlist of await searchPlaylists(topicQuery, 10, preferredChannelId)) {
      if (seen.has(playlist.playlistId)) continue
      seen.add(playlist.playlistId)
      candidates.push(playlist)
    }
    for (const playlist of await searchPlaylists(topicQuery, 10)) {
      if (seen.has(playlist.playlistId)) continue
      seen.add(playlist.playlistId)
      candidates.push(playlist)
    }
  }

  const ranked = candidates
    .map((playlist) => ({
      ...playlist,
      score: scorePlaylistCandidate(playlist, album.title, album.tracks.length, preferredChannelId),
    }))
    .filter((playlist) => (playlist.score ?? 0) >= 60)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return ranked[0] ?? null
}

export interface PlaylistResolveResult {
  resolved: number
  total: number
  playlist: YouTubePlaylistCandidate
  unmatchedTracks: Track[]
}

export async function resolveAlbumFromYouTubePlaylist(
  uid: string,
  album: Album,
  playlistId: string,
  tracksToResolve?: Track[],
  onProgress?: (completed: number, total: number) => void,
): Promise<PlaylistResolveResult> {
  const playlist = await getPlaylistById(playlistId)
  if (!playlist) {
    throw new PlaylistResolveError('Playlist not found on YouTube')
  }

  const videos = await listPlaylistVideos(playlistId)
  if (!videos.length) {
    throw new PlaylistResolveError('Playlist has no videos')
  }

  const targetTracks = tracksToResolve ?? album.tracks
  const matches = matchTracksToPlaylistVideos(targetTracks, videos)

  let resolved = 0
  for (const [index, track] of targetTracks.entries()) {
    const video = matches.get(track.id)
    if (video) {
      await saveTrackMapping(uid, {
        trackId: track.id,
        videoId: video.videoId,
        videoTitle: video.title,
        channelTitle: video.channelTitle,
        durationMs: video.durationMs,
        source: 'playlist',
        searchQuery: `playlist:${playlistId}`,
      })
      resolved += 1
    }
    onProgress?.(index + 1, targetTracks.length)
  }

  const updatedAlbum = await setAlbumYouTubePlaylist(uid, album.id, {
    playlistId: playlist.playlistId,
    title: playlist.title,
  })

  const unmatchedTracks = targetTracks.filter((track) => !matches.has(track.id))

  return {
    resolved,
    total: targetTracks.length,
    playlist: {
      ...playlist,
      title: updatedAlbum.youtubePlaylistTitle ?? playlist.title,
    },
    unmatchedTracks,
  }
}

export async function findAndResolveAlbumFromPlaylist(
  uid: string,
  album: Album,
  context: ArtistResolveContext,
  artistName: string,
  tracksToResolve?: Track[],
  onProgress?: (completed: number, total: number) => void,
): Promise<PlaylistResolveResult> {
  const playlist = await findTopicPlaylistForAlbum(artistName, album, context.preferredChannelId)
  if (!playlist) {
    throw new PlaylistResolveError(
      'No matching YouTube playlist found. Try pasting a playlist URL instead.',
    )
  }

  return resolveAlbumFromYouTubePlaylist(
    uid,
    album,
    playlist.playlistId,
    tracksToResolve,
    onProgress,
  )
}
