import { setAlbumYouTubePlaylist } from '@/lib/album/firestore'
import { setArtistPreferredYouTubeChannel } from '@/lib/artist/firestore'
import {
  getChannelUploadsInfo,
  getPlaylistById,
  getVideosByIds,
  listPlaylistVideoSnippets,
  listPlaylistVideos,
  searchChannels,
  searchVideos,
} from '@/lib/youtube/client'
import { saveTrackMapping } from '@/lib/youtube/firestore'
import {
  matchTracksToPlaylistVideos,
  normalizeTrackTitle,
  scoreTrackVideoTitleMatch,
} from '@/lib/youtube/match'
import type { Album, Artist, Track } from '@/types/library'
import type {
  ArtistResolveContext,
  YouTubeChannelCandidate,
  YouTubePlaylistCandidate,
  YouTubeVideoCandidate,
} from '@/types/youtube'

export class PlaylistResolveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlaylistResolveError'
  }
}

/** Prefer `{artist} - Topic`, then exact `{artist}`. */
export function scoreArtistChannelCandidate(
  channel: YouTubeChannelCandidate,
  artistName: string,
): number {
  const artistNorm = normalizeTrackTitle(artistName)
  const titleNorm = normalizeTrackTitle(channel.channelTitle)
  if (!artistNorm || !titleNorm) return 0

  const isTopic = titleNorm.includes('topic')
  if (isTopic) {
    if (titleNorm === `${artistNorm} topic`) return 100
    if (titleNorm.startsWith(artistNorm) && titleNorm.endsWith('topic')) return 90
    if (titleNorm.includes(artistNorm)) return 60
    return 0
  }

  if (titleNorm === artistNorm) return 80
  if (titleNorm.startsWith(artistNorm) || titleNorm.includes(artistNorm)) return 40
  return 0
}

export function rankArtistChannels(
  channels: YouTubeChannelCandidate[],
  artistName: string,
): YouTubeChannelCandidate[] {
  return channels
    .map((channel) => ({
      ...channel,
      score: scoreArtistChannelCandidate(channel, artistName),
    }))
    .filter((channel) => (channel.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

export function isTopicChannelTitle(channelTitle: string): boolean {
  return normalizeTrackTitle(channelTitle).includes('topic')
}

/**
 * Topic/auto-generated uploads often return IFrame error 150 (embedding blocked)
 * even when videos.list status.embeddable is true. Prefer a non-Topic match for playback.
 */
export async function findPlayableVideoForTrack(
  artistName: string,
  track: Track,
  topicMatch?: YouTubeVideoCandidate,
): Promise<YouTubeVideoCandidate | null> {
  const query = `${artistName} ${track.title}`.trim()
  const candidates = await searchVideos(query, 10)

  const ranked = candidates
    .map((candidate) => {
      const titleScore = scoreTrackVideoTitleMatch(track.title, candidate.title)
      if (titleScore < 70) return null
      let score = titleScore
      if (!isTopicChannelTitle(candidate.channelTitle)) score += 50
      if (track.lengthMs && candidate.durationMs) {
        const diff = Math.abs(track.lengthMs - candidate.durationMs)
        score += Math.max(0, 30 - diff / 10_000)
      }
      return { ...candidate, score }
    })
    .filter((candidate): candidate is YouTubeVideoCandidate & { score: number } => candidate !== null)
    .sort((a, b) => b.score - a.score)

  const nonTopic = ranked.find((candidate) => !isTopicChannelTitle(candidate.channelTitle))
  if (nonTopic) return nonTopic
  return ranked[0] ?? topicMatch ?? null
}

async function discoverArtistChannels(artistName: string): Promise<YouTubeChannelCandidate[]> {
  const seen = new Set<string>()
  const merged: YouTubeChannelCandidate[] = []

  for (const query of [`${artistName} topic`, artistName]) {
    for (const channel of await searchChannels(query, 5)) {
      if (seen.has(channel.channelId)) continue
      seen.add(channel.channelId)
      merged.push(channel)
    }
  }

  return rankArtistChannels(merged, artistName)
}

async function withUploadsPlaylist(
  channel: YouTubeChannelCandidate,
): Promise<YouTubeChannelCandidate> {
  if (channel.uploadsPlaylistId) return channel
  const info = await getChannelUploadsInfo(channel.channelId)
  if (!info?.uploadsPlaylistId) {
    throw new PlaylistResolveError('Channel has no uploads playlist on YouTube')
  }
  return {
    ...channel,
    channelTitle: info.channelTitle || channel.channelTitle,
    uploadsPlaylistId: info.uploadsPlaylistId,
  }
}

export interface PlaylistResolveResult {
  resolved: number
  total: number
  /** Linked playlist, or channel label for uploads-based resolve. */
  playlist: YouTubePlaylistCandidate
  unmatchedTracks: Track[]
  preferredChannelArtist?: Artist
}

async function saveTrackMatches(
  uid: string,
  tracks: Track[],
  matches: Map<string, YouTubeVideoCandidate>,
  searchQuery: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<number> {
  const videoIds = [...new Set([...matches.values()].map((video) => video.videoId))]
  const details = await getVideosByIds(videoIds)

  let resolved = 0
  for (const [index, track] of tracks.entries()) {
    const matched = matches.get(track.id)
    const video = matched ? (details.get(matched.videoId) ?? matched) : undefined
    if (video) {
      await saveTrackMapping(uid, {
        trackId: track.id,
        videoId: video.videoId,
        videoTitle: video.title,
        channelTitle: video.channelTitle,
        channelId: video.channelId,
        durationMs: video.durationMs,
        source: 'auto',
        searchQuery,
      })
      resolved += 1
    }
    onProgress?.(index + 1, tracks.length)
  }
  return resolved
}

async function tryResolveFromChannelUploads(
  uid: string,
  channel: YouTubeChannelCandidate,
  tracksToResolve: Track[],
  onProgress?: (completed: number, total: number) => void,
): Promise<PlaylistResolveResult | null> {
  const resolvedChannel = await withUploadsPlaylist(channel)
  const uploadsPlaylistId = resolvedChannel.uploadsPlaylistId!
  const targetTracks = tracksToResolve

  let matches = new Map<string, YouTubeVideoCandidate>()
  await listPlaylistVideoSnippets(uploadsPlaylistId, {
    maxPages: 40,
    shouldStop: (videos) => {
      matches = matchTracksToPlaylistVideos(targetTracks, videos)
      onProgress?.(matches.size, targetTracks.length)
      return matches.size >= targetTracks.length
    },
  })

  if (!matches.size) return null

  const resolved = await saveTrackMatches(
    uid,
    targetTracks,
    matches,
    `channel-uploads:${resolvedChannel.channelId}`,
    onProgress,
  )

  return {
    resolved,
    total: targetTracks.length,
    playlist: {
      playlistId: uploadsPlaylistId,
      title: resolvedChannel.channelTitle,
      channelId: resolvedChannel.channelId,
      channelTitle: resolvedChannel.channelTitle,
    },
    unmatchedTracks: targetTracks.filter((track) => !matches.has(track.id)),
  }
}

/**
 * Resolve album tracks by matching against a Topic/artist channel's uploads
 * (cheap playlistItems), not by searching for an album playlist.
 */
export async function resolveAlbumViaArtistChannel(
  uid: string,
  album: Album,
  context: ArtistResolveContext,
  artistName: string,
  tracksToResolve?: Track[],
  onProgress?: (completed: number, total: number) => void,
): Promise<PlaylistResolveResult> {
  const targetTracks = tracksToResolve ?? album.tracks
  const tried = new Set<string>()
  let preferredChannelArtist: Artist | undefined

  if (context.preferredChannelId) {
    tried.add(context.preferredChannelId)
    const result = await tryResolveFromChannelUploads(
      uid,
      {
        channelId: context.preferredChannelId,
        channelTitle: context.preferredChannelTitle ?? '',
      },
      targetTracks,
      onProgress,
    )
    if (result) return { ...result, preferredChannelArtist }
  }

  const discovered = await discoverArtistChannels(artistName)
  if (!discovered.length && !context.preferredChannelId) {
    throw new PlaylistResolveError(
      'No artist/Topic channel found on YouTube. Try Resolve all (search) or paste a playlist URL.',
    )
  }

  for (const channel of discovered) {
    if (tried.has(channel.channelId)) continue
    tried.add(channel.channelId)

    const result = await tryResolveFromChannelUploads(
      uid,
      channel,
      targetTracks,
      onProgress,
    )
    if (!result) continue

    preferredChannelArtist = await setArtistPreferredYouTubeChannel(uid, context.artistId, {
      channelId: channel.channelId,
      channelTitle: channel.channelTitle,
    })

    return { ...result, preferredChannelArtist }
  }

  throw new PlaylistResolveError(
    'No matching tracks found on the artist/Topic channel uploads. Try Resolve all (search) or paste a playlist URL.',
  )
}

/** @deprecated use resolveAlbumViaArtistChannel */
export async function findAndResolveAlbumFromPlaylist(
  uid: string,
  album: Album,
  context: ArtistResolveContext,
  artistName: string,
  tracksToResolve?: Track[],
  onProgress?: (completed: number, total: number) => void,
): Promise<PlaylistResolveResult> {
  return resolveAlbumViaArtistChannel(
    uid,
    album,
    context,
    artistName,
    tracksToResolve,
    onProgress,
  )
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
        channelId: video.channelId,
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

  return {
    resolved,
    total: targetTracks.length,
    playlist: {
      ...playlist,
      title: updatedAlbum.youtubePlaylistTitle ?? playlist.title,
    },
    unmatchedTracks: targetTracks.filter((track) => !matches.has(track.id)),
  }
}
