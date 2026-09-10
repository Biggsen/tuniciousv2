import type { FunnelTemplateStage } from '@/lib/pipeline/funnelTemplates'
import type { Playlist } from '@/types/library'

export function normalizePlaylistName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function formatStagePlaylistName(pipelineName: string, stageName: string): string {
  return `${pipelineName.trim()} - ${stageName}`
}

export function suggestPlaylistForStage(
  stage: Pick<FunnelTemplateStage, 'name'>,
  playlists: Playlist[],
  pipelineName?: string,
): Playlist | undefined {
  const trimmedPipelineName = pipelineName?.trim()
  const candidates = [
    trimmedPipelineName
      ? normalizePlaylistName(formatStagePlaylistName(trimmedPipelineName, stage.name))
      : null,
    normalizePlaylistName(stage.name),
  ].filter((value): value is string => value !== null)

  for (const target of candidates) {
    const match = playlists.find(
      (playlist) =>
        !playlist.pipelineId && normalizePlaylistName(playlist.name) === target,
    )
    if (match) return match
  }

  return undefined
}

export function buildDefaultStageMappings(
  stages: FunnelTemplateStage[],
  playlists: Playlist[],
  pipelineName?: string,
): Record<string, string | 'create'> {
  const mappings: Record<string, string | 'create'> = {}

  for (const stage of stages) {
    const suggested = suggestPlaylistForStage(stage, playlists, pipelineName)
    mappings[stage.key] = suggested?.id ?? 'create'
  }

  return mappings
}

export function validatePipelineName(name: string, existingNames: string[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) {
    return 'Funnel name is required.'
  }

  const normalized = normalizePlaylistName(trimmed)
  if (existingNames.some((existing) => normalizePlaylistName(existing) === normalized)) {
    return 'A funnel with this name already exists.'
  }

  return null
}
