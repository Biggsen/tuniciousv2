import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  getPlaylistById,
  hydratePlaylistMemberAlbums,
  listPlaylistMembers,
} from '@/lib/playlist/firestore'
import { listPlaylistWorkflowStates, type PlaylistWorkflowRowState } from '@/lib/pipeline/service'
import { getTrackPlayStatsMap } from '@/lib/sessions/firestore'
import { getMappingsForTrackIds } from '@/lib/youtube/firestore'
import { usePlayStatsStore } from '@/stores/playStats'
import type { Playlist, PlaylistMember } from '@/types/library'
import type { TrackYouTubeMapping } from '@/types/youtube'

interface PlaylistDetailCache {
  playlist: Playlist
  members: PlaylistMember[]
  albumsHydrated: boolean
  mappings: Map<string, TrackYouTubeMapping>
  trackDataLoaded: boolean
  workflowEnabled: boolean
  workflowBlockedReason: string | null
  workflowByAlbumId: Map<string, PlaylistWorkflowRowState>
}

export const usePlaylistDetailStore = defineStore('playlistDetail', () => {
  const cacheById = ref<Map<string, PlaylistDetailCache>>(new Map())
  const trackDataInflight = new Map<
    string,
    Promise<{
      mappings: Map<string, TrackYouTubeMapping>
      members: PlaylistMember[]
    }>
  >()

  function getCached(playlistId: string): PlaylistDetailCache | undefined {
    return cacheById.value.get(playlistId)
  }

  function setCached(playlistId: string, entry: PlaylistDetailCache): void {
    const next = new Map(cacheById.value)
    next.set(playlistId, entry)
    cacheById.value = next
  }

  function patchAlbumInCache(albumId: string, patch: (album: PlaylistMember['album']) => PlaylistMember['album']): void {
    let changed = false
    const next = new Map(cacheById.value)
    for (const [id, cache] of next) {
      let membersChanged = false
      const members = cache.members.map((member) => {
        if (member.album.id !== albumId) return member
        membersChanged = true
        return { ...member, album: patch(member.album) }
      })
      if (membersChanged) {
        next.set(id, { ...cache, members })
        changed = true
      }
    }
    if (changed) cacheById.value = next
  }

  function patchAlbumTitle(albumId: string, title: string): void {
    patchAlbumInCache(albumId, (album) => ({ ...album, title }))
  }

  function patchTrackTitle(albumId: string, trackId: string, title: string): void {
    patchAlbumInCache(albumId, (album) => ({
      ...album,
      tracks: album.tracks.map((track) =>
        track.id === trackId ? { ...track, title } : track,
      ),
    }))
  }

  function patchAlbumCovers(
    albumId: string,
    covers: { coverUrlSmall?: string; coverUrlLarge?: string },
  ): void {
    patchAlbumInCache(albumId, (album) => ({
      ...album,
      coverUrlSmall: covers.coverUrlSmall,
      coverUrlLarge: covers.coverUrlLarge,
    }))
  }

  function invalidate(playlistId?: string): void {
    if (!playlistId) {
      cacheById.value = new Map()
      trackDataInflight.clear()
      return
    }
    const next = new Map(cacheById.value)
    next.delete(playlistId)
    cacheById.value = next
    trackDataInflight.delete(playlistId)
  }

  async function loadPlaylistShell(
    uid: string,
    playlistId: string,
    options: { force?: boolean } = {},
  ): Promise<PlaylistDetailCache> {
    if (!options.force) {
      const cached = getCached(playlistId)
      if (cached) return cached
    }

    const playlist = await getPlaylistById(uid, playlistId)
    if (!playlist) {
      throw new Error('Playlist not found')
    }

    const members = await listPlaylistMembers(uid, playlistId)
    const workflowState = await listPlaylistWorkflowStates(
      uid,
      playlistId,
      members.map((member) => member.album.id),
    )

    const entry: PlaylistDetailCache = {
      playlist,
      members,
      albumsHydrated: false,
      mappings: new Map(),
      trackDataLoaded: false,
      workflowEnabled: workflowState.enabled,
      workflowBlockedReason: workflowState.blockedReason ?? null,
      workflowByAlbumId: workflowState.byAlbumId,
    }
    setCached(playlistId, entry)
    return entry
  }

  async function ensureAlbumsHydrated(uid: string, playlistId: string): Promise<PlaylistMember[]> {
    let cached = getCached(playlistId)
    if (!cached) {
      cached = await loadPlaylistShell(uid, playlistId)
    }
    if (cached.albumsHydrated) return cached.members

    const members = await hydratePlaylistMemberAlbums(uid, cached.members)
    setCached(playlistId, { ...cached, members, albumsHydrated: true })
    return members
  }

  async function ensureTrackData(
    uid: string,
    playlistId: string,
    options: { force?: boolean } = {},
  ): Promise<{
    mappings: Map<string, TrackYouTubeMapping>
    members: PlaylistMember[]
  }> {
    const members = await ensureAlbumsHydrated(uid, playlistId)
    const cached = getCached(playlistId)
    if (!cached) {
      throw new Error('Playlist not found')
    }
    if (cached.trackDataLoaded && !options.force) {
      return {
        mappings: cached.mappings,
        members: cached.members,
      }
    }

    const inflight = trackDataInflight.get(playlistId)
    if (inflight && !options.force) return inflight

    const loadPromise = (async () => {
      const trackIds = members.flatMap((member) => member.album.tracks.map((track) => track.id))
      const [mappings, playStats] = await Promise.all([
        getMappingsForTrackIds(uid, trackIds),
        getTrackPlayStatsMap(uid, trackIds),
      ])
      usePlayStatsStore().hydrate(playStats)
      const latest = getCached(playlistId) ?? cached
      setCached(playlistId, {
        ...latest,
        members,
        albumsHydrated: true,
        mappings,
        trackDataLoaded: true,
      })
      return { mappings, members }
    })()

    trackDataInflight.set(playlistId, loadPromise)
    try {
      return await loadPromise
    } finally {
      if (trackDataInflight.get(playlistId) === loadPromise) {
        trackDataInflight.delete(playlistId)
      }
    }
  }

  return {
    getCached,
    setCached,
    loadPlaylistShell,
    ensureAlbumsHydrated,
    ensureTrackData,
    patchAlbumTitle,
    patchTrackTitle,
    patchAlbumCovers,
    invalidate,
  }
})
