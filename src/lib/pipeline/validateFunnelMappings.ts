import {
  EVALUATION_STAGE_KEYS,
  type EvaluationStageKey,
} from '@/lib/pipeline/evaluationTemplate'
import type { Playlist } from '@/types/library'

export type StagePlaylistChoice =
  | { mode: 'existing'; playlistId: string }
  | { mode: 'create' }

export type EvaluationFunnelMappings = Record<EvaluationStageKey, StagePlaylistChoice>

export function validateEvaluationFunnelMappings(
  mappings: Partial<EvaluationFunnelMappings>,
  playlists: Playlist[],
): string | null {
  const playlistById = new Map(playlists.map((playlist) => [playlist.id, playlist]))
  const usedPlaylistIds = new Set<string>()

  for (const key of EVALUATION_STAGE_KEYS) {
    const choice = mappings[key]
    if (!choice) {
      return `Each stage must be mapped (${key} is missing).`
    }

    if (choice.mode === 'create') {
      continue
    }

    const playlist = playlistById.get(choice.playlistId)
    if (!playlist) {
      return `Playlist for ${key} was not found.`
    }

    if (playlist.pipelineId) {
      return `"${playlist.name}" is already linked to a pipeline.`
    }

    if (usedPlaylistIds.has(choice.playlistId)) {
      return `"${playlist.name}" cannot be mapped to more than one stage.`
    }

    usedPlaylistIds.add(choice.playlistId)
  }

  return null
}
