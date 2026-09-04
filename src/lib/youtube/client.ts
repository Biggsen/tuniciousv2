import { parseIso8601Duration } from '@/lib/youtube/duration'
import type {
  YouTubeChannelCandidate,
  YouTubePlaylistCandidate,
  YouTubeVideoCandidate,
} from '@/types/youtube'

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'YouTubeApiError'
  }
}

function formatYouTubeErrorBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string
        details?: Array<{ reason?: string }>
      }
    }
    const reason = parsed.error?.details?.find((detail) => detail.reason)?.reason
    if (reason === 'API_KEY_HTTP_REFERRER_BLOCKED') {
      return 'YouTube API key blocked: add http://localhost:4827/* to HTTP referrer restrictions in Google Cloud Console (or set YOUTUBE_API_REFERER in .env to match your allow-list). Restart the dev server after changing .env.'
    }
    if (parsed.error?.message) return parsed.error.message
  } catch {
    // not JSON
  }
  return body
}

interface YouTubeSearchItem {
  id?: { videoId?: string; playlistId?: string; channelId?: string }
  snippet?: {
    title?: string
    channelId?: string
    channelTitle?: string
  }
}

interface YouTubeVideoItem {
  id?: string
  snippet?: {
    title?: string
    channelId?: string
    channelTitle?: string
  }
  contentDetails?: {
    duration?: string
  }
}

async function youtubeFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const url = `/api/youtube/${path}?${query}`

  const response = await fetch(url)

  if (!response.ok) {
    const body = await response.text()
    throw new YouTubeApiError(
      formatYouTubeErrorBody(body) || `YouTube request failed (${response.status})`,
      response.status,
    )
  }

  return (await response.json()) as T
}

async function fetchVideoDetails(videoIds: string[]): Promise<Map<string, YouTubeVideoCandidate>> {
  if (!videoIds.length) return new Map()

  const map = new Map<string, YouTubeVideoCandidate>()
  const chunkSize = 50

  for (let offset = 0; offset < videoIds.length; offset += chunkSize) {
    const chunk = videoIds.slice(offset, offset + chunkSize)
    const data = await youtubeFetch<{ items?: YouTubeVideoItem[] }>('videos', {
      part: 'snippet,contentDetails',
      id: chunk.join(','),
    })

    for (const item of data.items ?? []) {
      if (!item.id) continue
      map.set(item.id, {
        videoId: item.id,
        title: item.snippet?.title ?? 'Unknown title',
        channelId: item.snippet?.channelId ?? '',
        channelTitle: item.snippet?.channelTitle ?? 'Unknown channel',
        durationMs: item.contentDetails?.duration
          ? parseIso8601Duration(item.contentDetails.duration)
          : undefined,
      })
    }
  }

  return map
}

export async function searchVideos(
  query: string,
  maxResults = 8,
  channelId?: string,
): Promise<YouTubeVideoCandidate[]> {
  const params: Record<string, string> = {
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(maxResults),
  }

  if (channelId) {
    params.channelId = channelId
  }

  const data = await youtubeFetch<{ items?: YouTubeSearchItem[] }>('search', params)

  const videoIds = (data.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id))

  if (!videoIds.length) return []

  const details = await fetchVideoDetails(videoIds)

  return videoIds
    .map((videoId) => details.get(videoId))
    .filter((candidate): candidate is YouTubeVideoCandidate => Boolean(candidate))
}

export async function getVideosByIds(videoIds: string[]): Promise<Map<string, YouTubeVideoCandidate>> {
  return fetchVideoDetails(videoIds)
}

export async function getVideoById(videoId: string): Promise<YouTubeVideoCandidate | null> {
  const details = await fetchVideoDetails([videoId])
  return details.get(videoId) ?? null
}

interface YouTubePlaylistItem {
  snippet?: {
    title?: string
    channelId?: string
    channelTitle?: string
    resourceId?: { videoId?: string }
    position?: number
  }
  contentDetails?: {
    videoId?: string
    duration?: string
  }
}

interface YouTubePlaylistResource {
  id?: string
  snippet?: {
    title?: string
    channelId?: string
    channelTitle?: string
  }
  contentDetails?: {
    itemCount?: number
  }
}

export async function searchChannels(
  query: string,
  maxResults = 5,
): Promise<YouTubeChannelCandidate[]> {
  const data = await youtubeFetch<{ items?: YouTubeSearchItem[] }>('search', {
    part: 'snippet',
    type: 'channel',
    q: query,
    maxResults: String(maxResults),
  })

  return (data.items ?? [])
    .map((item) => {
      const channelId = item.id?.channelId ?? item.snippet?.channelId
      if (!channelId) return null
      return {
        channelId,
        channelTitle: item.snippet?.title ?? item.snippet?.channelTitle ?? 'Unknown channel',
      }
    })
    .filter((item): item is YouTubeChannelCandidate => item !== null)
}

export async function getChannelUploadsInfo(
  channelId: string,
): Promise<YouTubeChannelCandidate | null> {
  const data = await youtubeFetch<{
    items?: Array<{
      id?: string
      snippet?: { title?: string }
      contentDetails?: { relatedPlaylists?: { uploads?: string } }
    }>
  }>('channels', {
    part: 'snippet,contentDetails',
    id: channelId,
  })

  const item = data.items?.[0]
  const uploadsPlaylistId = item?.contentDetails?.relatedPlaylists?.uploads
  if (!item?.id || !uploadsPlaylistId) return null

  return {
    channelId: item.id,
    channelTitle: item.snippet?.title ?? 'Unknown channel',
    uploadsPlaylistId,
  }
}

/**
 * List videos in a playlist using playlistItems only (cheap).
 * Does not call videos.list — titles come from snippets.
 */
export async function listPlaylistVideoSnippets(
  playlistId: string,
  options: {
    maxPages?: number
    pageSize?: number
    pageToken?: string
    /** Called after each page with all videos accumulated so far. Return true to stop paging. */
    shouldStop?: (videos: YouTubeVideoCandidate[]) => boolean
  } = {},
): Promise<YouTubeVideoCandidate[]> {
  const maxPages = options.maxPages ?? 40
  const pageSize = options.pageSize ?? 50
  const videos: YouTubeVideoCandidate[] = []
  let pageToken: string | undefined = options.pageToken

  for (let page = 0; page < maxPages; page += 1) {
    const params: Record<string, string> = {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: String(pageSize),
    }
    if (pageToken) params.pageToken = pageToken

    const data = await youtubeFetch<{
      items?: YouTubePlaylistItem[]
      nextPageToken?: string
    }>('playlistItems', params)

    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId
      if (!videoId) continue
      videos.push({
        videoId,
        title: item.snippet?.title ?? 'Unknown title',
        channelId: item.snippet?.channelId ?? '',
        channelTitle: item.snippet?.channelTitle ?? 'Unknown channel',
      })
    }

    if (options.shouldStop?.(videos)) break

    pageToken = data.nextPageToken
    if (!pageToken) break
  }

  return videos
}

export async function searchPlaylists(
  query: string,
  maxResults = 10,
  channelId?: string,
): Promise<YouTubePlaylistCandidate[]> {
  const params: Record<string, string> = {
    part: 'snippet',
    type: 'playlist',
    q: query,
    maxResults: String(maxResults),
  }

  if (channelId) {
    params.channelId = channelId
  }

  const data = await youtubeFetch<{ items?: YouTubeSearchItem[] }>('search', params)
  const playlistIds = (data.items ?? [])
    .map((item) => item.id?.playlistId)
    .filter((id): id is string => Boolean(id))

  if (!playlistIds.length) return []

  return getPlaylistsByIds(playlistIds)
}

export async function getPlaylistsByIds(
  playlistIds: string[],
): Promise<YouTubePlaylistCandidate[]> {
  if (!playlistIds.length) return []

  const data = await youtubeFetch<{ items?: YouTubePlaylistResource[] }>('playlists', {
    part: 'snippet,contentDetails',
    id: playlistIds.join(','),
  })

  return (data.items ?? [])
    .filter((item): item is YouTubePlaylistResource & { id: string } => Boolean(item.id))
    .map((item) => ({
      playlistId: item.id,
      title: item.snippet?.title ?? 'Unknown playlist',
      channelId: item.snippet?.channelId ?? '',
      channelTitle: item.snippet?.channelTitle ?? 'Unknown channel',
      itemCount: item.contentDetails?.itemCount,
    }))
}

export async function getPlaylistById(
  playlistId: string,
): Promise<YouTubePlaylistCandidate | null> {
  const playlists = await getPlaylistsByIds([playlistId])
  return playlists[0] ?? null
}

export async function listPlaylistVideos(playlistId: string): Promise<YouTubeVideoCandidate[]> {
  const items: YouTubePlaylistItem[] = []
  let pageToken: string | undefined

  do {
    const params: Record<string, string> = {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
    }
    if (pageToken) {
      params.pageToken = pageToken
    }

    const data = await youtubeFetch<{
      items?: YouTubePlaylistItem[]
      nextPageToken?: string
    }>('playlistItems', params)

    items.push(...(data.items ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  const videoIds = items
    .map((item) => item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId)
    .filter((id): id is string => Boolean(id))

  if (!videoIds.length) return []

  const details = await fetchVideoDetails(videoIds)

  return videoIds
    .map((videoId) => details.get(videoId))
    .filter((candidate): candidate is YouTubeVideoCandidate => Boolean(candidate))
}
