import { type Stage } from '@/types/pipeline'
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
