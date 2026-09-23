import {
  buildFunnelDisplayOrder,
  EVALUATION_FUNNEL_TEMPLATE,
  FILTER_FUNNEL_TEMPLATE,
  getTemplateStage,
} from '@/lib/pipeline/funnelTemplates'
import { type Pipeline, type Stage } from '@/types/pipeline'
import type { Playlist } from '@/types/library'

export function sortStagesByFunnelDisplayOrder(stages: Stage[]): Stage[] {
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  const source = stages.find((stage) => stage.pipelineRole === 'source')
  if (!source) return [...stages]

  const order: Stage[] = [source]
  let current = source.nextStageId ? byId.get(source.nextStageId) : undefined

  while (current) {
    order.push(current)
    if (current.terminationStageId) {
      const sink = byId.get(current.terminationStageId)
      if (sink) order.push(sink)
    }
    current = current.nextStageId ? byId.get(current.nextStageId) : undefined
  }

  return order
}

export function sortPlaylistsByPipelineStages(
  stages: Stage[],
  playlists: Playlist[],
): Playlist[] {
  const playlistById = new Map(playlists.map((playlist) => [playlist.id, playlist]))
  const ordered: Playlist[] = []

  for (const stage of sortStagesByFunnelDisplayOrder(stages)) {
    const playlist = playlistById.get(stage.playlistId)
    if (playlist) ordered.push(playlist)
  }

  for (const playlist of playlists) {
    if (!ordered.some((item) => item.id === playlist.id)) {
      ordered.push(playlist)
    }
  }

  return ordered
}

/**
 * Flat picker order: each funnel in pipeline name order, stages in funnel
 * progression, then non-stage playlists alphabetically.
 */
export function sortPlaylistsForPicker(
  pipelines: Pipeline[],
  stagesByPipelineId: Map<string, Stage[]>,
  playlists: Playlist[],
): Playlist[] {
  const ordered: Playlist[] = []
  const seen = new Set<string>()

  const pipelinesByName = [...pipelines].sort((a, b) => a.name.localeCompare(b.name))
  for (const pipeline of pipelinesByName) {
    const pipelinePlaylists = playlists.filter((playlist) => playlist.pipelineId === pipeline.id)
    for (const playlist of sortPlaylistsByPipelineStages(
      stagesByPipelineId.get(pipeline.id) ?? [],
      pipelinePlaylists,
    )) {
      if (seen.has(playlist.id)) continue
      ordered.push(playlist)
      seen.add(playlist.id)
    }
  }

  const remainder = playlists
    .filter((playlist) => !seen.has(playlist.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  ordered.push(...remainder)
  return ordered
}

const FUNNEL_STAGE_NAME_ORDER = [
  ...buildFunnelDisplayOrder(EVALUATION_FUNNEL_TEMPLATE.stages).map(
    (key) => getTemplateStage(EVALUATION_FUNNEL_TEMPLATE, key).name,
  ),
  ...buildFunnelDisplayOrder(FILTER_FUNNEL_TEMPLATE.stages).map(
    (key) => getTemplateStage(FILTER_FUNNEL_TEMPLATE, key).name,
  ),
]

function normalizeStageLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

const FUNNEL_STAGE_RANK = new Map(
  FUNNEL_STAGE_NAME_ORDER.map((name, index) => [normalizeStageLabel(name), index]),
)

/** Parse `Known - Queued` → funnel + stage labels. */
export function parseFunnelPlaylistName(
  name: string,
): { funnel: string; stage: string } | null {
  const separator = ' - '
  const index = name.lastIndexOf(separator)
  if (index <= 0) return null
  const funnel = name.slice(0, index).trim()
  const stage = name.slice(index + separator.length).trim()
  if (!funnel || !stage) return null
  if (!FUNNEL_STAGE_RANK.has(normalizeStageLabel(stage))) return null
  return { funnel, stage }
}

/**
 * Sort playlists for pickers without loading stage graphs — uses
 * `Funnel - Stage` names and template display order.
 */
export function sortPlaylistsForPickerByName(playlists: Playlist[]): Playlist[] {
  const withMeta = playlists.map((playlist) => {
    const parsed = parseFunnelPlaylistName(playlist.name)
    return {
      playlist,
      funnel: parsed?.funnel ?? null,
      stageRank: parsed ? (FUNNEL_STAGE_RANK.get(normalizeStageLabel(parsed.stage)) ?? 999) : 999,
    }
  })

  return withMeta
    .sort((a, b) => {
      if (a.funnel && b.funnel) {
        const funnelCompare = a.funnel.localeCompare(b.funnel)
        if (funnelCompare !== 0) return funnelCompare
        if (a.stageRank !== b.stageRank) return a.stageRank - b.stageRank
        return a.playlist.name.localeCompare(b.playlist.name)
      }
      if (a.funnel && !b.funnel) return -1
      if (!a.funnel && b.funnel) return 1
      return a.playlist.name.localeCompare(b.playlist.name)
    })
    .map((entry) => entry.playlist)
}
