import { getVideoById, searchVideos } from '@/lib/youtube/client'
import { saveTrackMapping } from '@/lib/youtube/firestore'
import { parseVideoIdFromInput } from '@/lib/youtube/parseUrl'
import { buildAutoSearchQuery, buildChannelScopedSearchQuery } from '@/lib/youtube/query'
import { rankCandidates } from '@/lib/youtube/rank'
import type { Track } from '@/types/library'
import type {
  ArtistResolveContext,
  TrackYouTubeMapping,
  YouTubeMappingSource,
  YouTubeVideoCandidate,
} from '@/types/youtube'

const CHANNEL_SCOPED_MAX_RESULTS = 25
const CHANNEL_RESULT_MIN_SCORE = 150

function mergeCandidates(
  existing: YouTubeVideoCandidate[],
  incoming: YouTubeVideoCandidate[],
): YouTubeVideoCandidate[] {
  const seen = new Set(existing.map((candidate) => candidate.videoId))
  const merged = [...existing]

  for (const candidate of incoming) {
    if (seen.has(candidate.videoId)) continue
    seen.add(candidate.videoId)
    merged.push(candidate)
  }

  return merged
}

async function findRankedCandidates(
  artistDisplay: string,
  track: Track,
  searchQuery: string,
  preferredChannelId?: string,
): Promise<YouTubeVideoCandidate[]> {
  let candidates: YouTubeVideoCandidate[] = []

  if (preferredChannelId) {
    const channelTrackQuery = buildChannelScopedSearchQuery(track.title)
    candidates = mergeCandidates(
      candidates,
      await searchVideos(channelTrackQuery, CHANNEL_SCOPED_MAX_RESULTS, preferredChannelId),
    )

    if (searchQuery !== channelTrackQuery) {
      candidates = mergeCandidates(
        candidates,
        await searchVideos(searchQuery, CHANNEL_SCOPED_MAX_RESULTS, preferredChannelId),
      )
    }

    const rankedChannel = rankCandidates(
      candidates,
      artistDisplay,
      track.lengthMs,
      preferredChannelId,
      track.title,
    )

    if ((rankedChannel[0]?.score ?? 0) >= CHANNEL_RESULT_MIN_SCORE) {
      return rankedChannel
    }
  }

  candidates = mergeCandidates(candidates, await searchVideos(searchQuery))
  return rankCandidates(candidates, artistDisplay, track.lengthMs, preferredChannelId, track.title)
}

export async function searchTrackCandidates(
  context: ArtistResolveContext,
  track: Track,
  searchQuery?: string,
): Promise<YouTubeVideoCandidate[]> {
  const query = searchQuery?.trim() || buildAutoSearchQuery(context.artistDisplay, track.title)
  return findRankedCandidates(
    context.artistDisplay,
    track,
    query,
    context.preferredChannelId,
  )
}

export async function autoResolveTrack(
  uid: string,
  context: ArtistResolveContext,
  track: Track,
): Promise<TrackYouTubeMapping | null> {
  const searchQuery = context.preferredChannelId
    ? buildChannelScopedSearchQuery(track.title)
    : buildAutoSearchQuery(context.artistDisplay, track.title)

  const ranked = await findRankedCandidates(
    context.artistDisplay,
    track,
    buildAutoSearchQuery(context.artistDisplay, track.title),
    context.preferredChannelId,
  )
  const best = ranked[0]
  if (!best) return null

  return saveTrackMapping(uid, {
    trackId: track.id,
    videoId: best.videoId,
    videoTitle: best.title,
    channelTitle: best.channelTitle,
    durationMs: best.durationMs,
    source: 'auto',
    searchQuery,
  })
}

export async function resolveTrackFromVideoInput(
  uid: string,
  trackId: string,
  input: string,
  source: YouTubeMappingSource = 'manual',
  searchQuery?: string,
): Promise<TrackYouTubeMapping> {
  const videoId = parseVideoIdFromInput(input)
  if (!videoId) {
    throw new Error('Invalid YouTube URL or video ID')
  }

  const video = await getVideoById(videoId)
  if (!video) {
    throw new Error('Video not found on YouTube')
  }

  return saveTrackMapping(uid, {
    trackId,
    videoId: video.videoId,
    videoTitle: video.title,
    channelTitle: video.channelTitle,
    durationMs: video.durationMs,
    source,
    searchQuery,
  })
}

export async function resolveTrackFromCandidate(
  uid: string,
  trackId: string,
  candidate: YouTubeVideoCandidate,
  source: YouTubeMappingSource,
  searchQuery?: string,
): Promise<TrackYouTubeMapping> {
  return saveTrackMapping(uid, {
    trackId,
    videoId: candidate.videoId,
    videoTitle: candidate.title,
    channelTitle: candidate.channelTitle,
    durationMs: candidate.durationMs,
    source,
    searchQuery,
  })
}

export async function resolveAllAlbumTracks(
  uid: string,
  context: ArtistResolveContext,
  tracks: Track[],
  onProgress?: (completed: number, total: number) => void,
): Promise<number> {
  let resolved = 0

  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index]
    const mapping = await autoResolveTrack(uid, context, track)
    if (mapping) resolved += 1
    onProgress?.(index + 1, tracks.length)
  }

  return resolved
}
