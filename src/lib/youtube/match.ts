import type { Track } from '@/types/library'
import type { YouTubeVideoCandidate } from '@/types/youtube'

export function normalizeTrackTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function videoTitleForMatch(videoTitle: string): string {
  const normalized = normalizeTrackTitle(videoTitle)
  const dashIndex = normalized.lastIndexOf(' - ')
  if (dashIndex >= 0) {
    return normalized.slice(dashIndex + 3).trim()
  }
  return normalized
}

export function scoreTrackVideoTitleMatch(trackTitle: string, videoTitle: string): number {
  const trackNorm = normalizeTrackTitle(trackTitle)
  const videoNorm = videoTitleForMatch(videoTitle)

  if (videoNorm === trackNorm) return 100
  if (videoNorm.includes(trackNorm) || trackNorm.includes(videoNorm)) return 70
  return 0
}

export function matchTracksToPlaylistVideos(
  tracks: Track[],
  videos: YouTubeVideoCandidate[],
): Map<string, YouTubeVideoCandidate> {
  const usedVideoIds = new Set<string>()
  const matches = new Map<string, YouTubeVideoCandidate>()

  for (const [trackIndex, track] of tracks.entries()) {
    let best: YouTubeVideoCandidate | null = null
    let bestScore = 0

    for (const [videoIndex, video] of videos.entries()) {
      if (usedVideoIds.has(video.videoId)) continue

      const titleScore = scoreTrackVideoTitleMatch(track.title, video.title)
      if (titleScore === 0) continue

      let score = titleScore

      if (track.lengthMs && video.durationMs) {
        const diff = Math.abs(track.lengthMs - video.durationMs)
        score += Math.max(0, 30 - diff / 10_000)
      }

      score += Math.max(0, 15 - Math.abs(trackIndex - videoIndex) * 3)

      if (score > bestScore) {
        bestScore = score
        best = video
      }
    }

    if (best && bestScore >= 70) {
      matches.set(track.id, best)
      usedVideoIds.add(best.videoId)
    }
  }

  return matches
}
