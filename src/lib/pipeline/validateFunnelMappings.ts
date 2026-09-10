import { getFunnelTemplate } from '@/lib/pipeline/funnelTemplates'
import type { Playlist } from '@/types/library'
import type { PipelineTemplateId } from '@/types/pipeline'

export type StagePlaylistChoice =
  | { mode: 'existing'; playlistId: string }
  | { mode: 'create' }

export type FunnelStageMappings = Record<string, StagePlaylistChoice>

/** @deprecated Prefer FunnelStageMappings. */
export type EvaluationFunnelMappings = FunnelStageMappings

export function validateFunnelMappings(
  templateId: PipelineTemplateId,
  mappings: Partial<FunnelStageMappings>,
  playlists: Playlist[],
): string | null {
  const template = getFunnelTemplate(templateId)
  const playlistById = new Map(playlists.map((playlist) => [playlist.id, playlist]))
  const usedPlaylistIds = new Set<string>()

  for (const stage of template.stages) {
    const choice = mappings[stage.key]
    if (!choice) {
      return `Each stage must be mapped (${stage.name} is missing).`
    }

    if (choice.mode === 'create') {
      continue
    }

    const playlist = playlistById.get(choice.playlistId)
    if (!playlist) {
      return `Playlist for ${stage.name} was not found.`
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

/** @deprecated Prefer validateFunnelMappings('evaluation', …). */
export function validateEvaluationFunnelMappings(
  mappings: Partial<FunnelStageMappings>,
  playlists: Playlist[],
): string | null {
  return validateFunnelMappings('evaluation', mappings, playlists)
}
