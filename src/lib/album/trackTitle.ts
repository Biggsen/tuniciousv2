import type { Track } from '@/types/library'

export function replaceTrackTitle(tracks: Track[], trackId: string, title: string): Track[] {
  const trimmed = title.trim()
  if (!trimmed) {
    throw new Error('Track title is required')
  }

  let found = false
  const next = tracks.map((track) => {
    if (track.id !== trackId) return track
    found = true
    if (track.title === trimmed) return track
    return { ...track, title: trimmed }
  })

  if (!found) {
    throw new Error('Track not found')
  }

  return next
}
