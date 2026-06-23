import type { YouTubeVideoCandidate } from '@/types/youtube'

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function scoreVideoCandidate(
  candidate: YouTubeVideoCandidate,
  artist: string,
  trackLengthMs?: number,
  preferredChannelId?: string,
  trackTitle?: string,
): number {
  let score = 0
  const titleLower = candidate.title.toLowerCase()
  const artistLower = artist.toLowerCase()

  if (trackTitle) {
    const trackNorm = normalizeTitle(trackTitle)
    const titleNorm = normalizeTitle(candidate.title)
    if (titleNorm === trackNorm) {
      score += 120
    } else if (titleNorm.includes(trackNorm) || trackNorm.includes(titleNorm)) {
      score += 70
    }
  }

  if (preferredChannelId && candidate.channelId === preferredChannelId) {
    score += 80
  }

  if (titleLower.includes(artistLower)) {
    score += 50
  }

  if (titleLower.includes('topic')) {
    score += 20
  }

  if (candidate.channelTitle.toLowerCase().includes('topic')) {
    score += 15
  }

  if (trackLengthMs && candidate.durationMs) {
    const diff = Math.abs(candidate.durationMs - trackLengthMs)
    score += Math.max(0, 40 - diff / 10_000)
  }

  return score
}

export function rankCandidates(
  candidates: YouTubeVideoCandidate[],
  artist: string,
  trackLengthMs?: number,
  preferredChannelId?: string,
  trackTitle?: string,
): YouTubeVideoCandidate[] {
  return [...candidates]
    .map((candidate) => ({
      ...candidate,
      score: scoreVideoCandidate(candidate, artist, trackLengthMs, preferredChannelId, trackTitle),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}
