import { normalizePlaylistName } from '@/lib/pipeline/suggestPlaylist'
import type { Playlist } from '@/types/library'

export function normalizeCsvFilename(filename: string): string {
  const withoutExt = filename.replace(/\.csv$/i, '')
  const withSpaces = withoutExt.replace(/_/g, ' ')
  return normalizePlaylistName(withSpaces)
}

function collapsedPlaylistName(name: string): string {
  return normalizePlaylistName(name.replace(/\s*-\s*/g, ' '))
}

function stageSegment(name: string): string {
  const parts = name.split(/\s*-\s*/)
  return normalizePlaylistName(parts[parts.length - 1] ?? name)
}

export function matchPlaylistFromFilename(
  filename: string,
  playlists: Playlist[],
): Playlist | null {
  const fileNorm = normalizeCsvFilename(filename)
  if (!fileNorm || !playlists.length) return null

  for (const playlist of playlists) {
    if (normalizePlaylistName(playlist.name) === fileNorm) return playlist
  }

  for (const playlist of playlists) {
    if (collapsedPlaylistName(playlist.name) === fileNorm) return playlist
  }

  const segmentMatches = playlists.filter((playlist) => stageSegment(playlist.name) === fileNorm)
  if (segmentMatches.length === 1) return segmentMatches[0]

  return null
}
