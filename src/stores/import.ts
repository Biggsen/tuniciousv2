import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { markAlbumsInLibrary } from '@/lib/import/matchLibrary'
import {
  matchPlaylistFromFilename,
  matchPlaylistFromNormalizedName,
} from '@/lib/import/matchPlaylistFromFilename'
import { mergeStagedAlbums, parseSpotifyExportCsv } from '@/lib/import/parseSpotifyCsv'
import {
  stageAlbumsFromRepo,
  type V1FunnelGroup,
} from '@/lib/import/v1ExportRepo'
import { firstPendingId, nextPendingAfter } from '@/lib/import/queueNavigation'
import type { StagedAlbum, StagedAlbumSource } from '@/lib/import/types'
import { listAlbums } from '@/lib/album/firestore'
import { addAlbumToPlaylist, listPlaylists } from '@/lib/playlist/firestore'
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import type { Album, Playlist } from '@/types/library'

function preserveResolvedStatus(merged: StagedAlbum[], previous: StagedAlbum[]): StagedAlbum[] {
  const previousByUri = new Map(previous.map((album) => [album.albumUri, album]))
  return merged.map((album) => {
    const existing = previousByUri.get(album.albumUri)
    if (existing && existing.status !== 'pending') {
      return {
        ...album,
        status: existing.status,
        libraryAlbumId: existing.libraryAlbumId,
      }
    }
    return album
  })
}

export const useImportStore = defineStore('import', () => {
  const albums = ref<StagedAlbum[]>([])
  const selectedId = ref<string | null>(null)
  const sourceLabel = ref<string | null>(null)
  const parseError = ref<string | null>(null)
  const parsing = ref(false)
  const matchingLibrary = ref(false)
  const showInLibrary = ref(false)
  const playlists = ref<Playlist[]>([])
  const libraryAlbums = ref<Album[]>([])
  const syncPlaylistId = ref<string | null>(null)
  const autoDetectedPlaylistId = ref<string | null>(null)
  const syncError = ref<string | null>(null)
  const syncingInLibrary = ref(false)
  const automationEnabled = ref(false)
  const importSource = ref<StagedAlbumSource | null>(null)

  const hasSession = computed(() => albums.value.length > 0)

  const selectedAlbum = computed(
    () => albums.value.find((album) => album.id === selectedId.value) ?? null,
  )

  const syncPlaylist = computed(
    () => playlists.value.find((playlist) => playlist.id === syncPlaylistId.value) ?? null,
  )

  const inLibraryAlbums = computed(() => albums.value.filter((album) => album.status === 'in-library'))
  const importedCount = computed(() => albums.value.filter((album) => album.status === 'imported').length)
  const pendingCount = computed(() => albums.value.filter((album) => album.status === 'pending').length)
  const skippedCount = computed(() => albums.value.filter((album) => album.status === 'skipped').length)

  const syncableAlbums = computed(() =>
    albums.value.filter(
      (album) =>
        (album.status === 'in-library' || album.status === 'imported') && album.libraryAlbumId,
    ),
  )

  const displayedAlbums = computed(() => {
    let list = albums.value
    if (!showInLibrary.value) {
      list = list.filter((album) => album.status !== 'in-library')
    }
    return list.filter((album) => album.status !== 'skipped' && album.status !== 'imported')
  })

  function ensurePendingSelection() {
    const selected = albums.value.find((album) => album.id === selectedId.value)
    if (selected?.status === 'pending') return

    selectedId.value = firstPendingId(albums.value)
  }

  function advanceToNextPending(albumUri: string) {
    if (selectedAlbum.value?.albumUri !== albumUri) return
    const nextId = nextPendingAfter(albums.value, albumUri)
    if (nextId) {
      selectedId.value = nextId
    }
  }

  async function addAlbumToSyncPlaylist(libraryAlbumId: string): Promise<void> {
    const uid = useAuthStore().user?.uid
    if (!uid || !syncPlaylistId.value) return
    await addAlbumToPlaylist(uid, syncPlaylistId.value, libraryAlbumId)
  }

  async function matchLibraryAndPlaylists(
    uid: string,
    options: {
      filenameForDetect?: string | null
      playlistNameHint?: string | null
      syncPlaylistIdOverride?: string | null
    } = {},
  ) {
    matchingLibrary.value = true

    try {
      const [loadedPlaylists, library] = await Promise.all([listPlaylists(uid), listAlbums(uid)])
      playlists.value = loadedPlaylists
      libraryAlbums.value = library
      albums.value = markAlbumsInLibrary(albums.value, library)
      ensurePendingSelection()

      if (options.syncPlaylistIdOverride) {
        const exists = loadedPlaylists.some((playlist) => playlist.id === options.syncPlaylistIdOverride)
        if (exists) {
          autoDetectedPlaylistId.value = options.syncPlaylistIdOverride
          syncPlaylistId.value = options.syncPlaylistIdOverride
          return
        }
      }

      let detected: Playlist | null = null
      if (options.playlistNameHint) {
        detected = matchPlaylistFromNormalizedName(options.playlistNameHint, loadedPlaylists)
      } else if (options.filenameForDetect) {
        detected = matchPlaylistFromFilename(options.filenameForDetect, loadedPlaylists)
      }

      if (detected) {
        autoDetectedPlaylistId.value = detected.id
        syncPlaylistId.value = detected.id
      }
    } catch (err) {
      parseError.value =
        err instanceof Error ? err.message : 'Failed to match albums against your library'
    } finally {
      matchingLibrary.value = false
    }
  }

  async function loadFiles(files: File[]) {
    parsing.value = true
    parseError.value = null
    syncError.value = null

    const isFreshSession = !albums.value.length
    let filenameForDetect: string | null = null

    try {
      const parsedAlbums: StagedAlbum[] = []

      for (const file of files) {
        const text = await file.text()
        parsedAlbums.push(...parseSpotifyExportCsv(text))
      }

      if (!parsedAlbums.length) {
        parseError.value = 'No albums found in the selected file(s).'
        return
      }

      const merged = mergeStagedAlbums(parsedAlbums)
      const next = albums.value.length
        ? preserveResolvedStatus(mergeStagedAlbums([...albums.value, ...merged]), albums.value)
        : merged

      albums.value = next
      importSource.value = 'csv'
      sourceLabel.value =
        files.length === 1 ? files[0].name : `${files.length} files (${files.map((f) => f.name).join(', ')})`

      if (isFreshSession && files.length === 1) {
        filenameForDetect = files[0].name
      } else if (isFreshSession && files.length > 1) {
        autoDetectedPlaylistId.value = null
        syncPlaylistId.value = null
      }
    } catch (err) {
      parseError.value = err instanceof Error ? err.message : 'Failed to parse CSV'
      return
    } finally {
      parsing.value = false
    }

    const uid = useAuthStore().user?.uid
    if (!uid) {
      ensurePendingSelection()
      return
    }

    await matchLibraryAndPlaylists(uid, { filenameForDetect })
  }

  async function loadV1FromRepo(
    group: V1FunnelGroup,
    v1PlaylistId: string,
  ): Promise<void> {
    parsing.value = true
    parseError.value = null
    syncError.value = null

    const uid = useAuthStore().user?.uid
    if (!uid) {
      parseError.value = 'Sign in required to load the v1 export.'
      parsing.value = false
      return
    }

    try {
      const { staged, stage, group: loadedGroup } = await stageAlbumsFromRepo({
        v2Uid: uid,
        group,
        v1PlaylistId,
      })

      if (!staged.length) {
        parseError.value = `No albums currently on “${stage.name}” in the v1 export.`
        return
      }

      albums.value = staged
      importSource.value = 'v1'
      sourceLabel.value = `v1 · ${loadedGroup} · ${stage.name} (${staged.length} albums)`
      autoDetectedPlaylistId.value = null
      syncPlaylistId.value = null

      await matchLibraryAndPlaylists(uid, {
        syncPlaylistIdOverride: stage.v2PlaylistId,
        playlistNameHint: stage.name,
      })
    } catch (err) {
      parseError.value = err instanceof Error ? err.message : 'Failed to load v1 export'
    } finally {
      parsing.value = false
    }
  }

  function markInLibrary(albumUri: string, libraryAlbumId: string, advance = false) {
    albums.value = albums.value.map((album) =>
      album.albumUri === albumUri
        ? { ...album, status: 'in-library', libraryAlbumId }
        : album,
    )
    if (advance) {
      advanceAfterAlbum(albumUri)
    }
  }

  function markImported(albumUri: string, libraryAlbumId: string) {
    albums.value = albums.value.map((album) =>
      album.albumUri === albumUri
        ? { ...album, status: 'imported', libraryAlbumId }
        : album,
    )
    advanceAfterAlbum(albumUri)
  }

  async function handleImported(payload: { albumUri: string; libraryAlbumId: string }) {
    markImported(payload.albumUri, payload.libraryAlbumId)
    useLibraryStore().invalidate()

    if (!syncPlaylistId.value) return

    syncError.value = null
    try {
      await addAlbumToSyncPlaylist(payload.libraryAlbumId)
    } catch (err) {
      syncError.value =
        err instanceof Error ? err.message : 'Failed to add imported album to playlist'
    }
  }

  async function syncInLibraryAlbums() {
    if (!syncPlaylistId.value || !syncableAlbums.value.length) return

    syncingInLibrary.value = true
    syncError.value = null

    try {
      for (const album of syncableAlbums.value) {
        if (!album.libraryAlbumId) continue
        await addAlbumToSyncPlaylist(album.libraryAlbumId)
      }
    } catch (err) {
      syncError.value =
        err instanceof Error ? err.message : 'Failed to add in-library albums to playlist'
    } finally {
      syncingInLibrary.value = false
    }
  }

  function setSyncPlaylistId(playlistId: string | null) {
    syncPlaylistId.value = playlistId
    syncError.value = null
  }

  function startAutomation() {
    automationEnabled.value = true
  }

  function stopAutomation() {
    automationEnabled.value = false
  }

  function skipAlbum(albumUri: string) {
    albums.value = albums.value.map((album) =>
      album.albumUri === albumUri ? { ...album, status: 'skipped' } : album,
    )
    advanceAfterAlbum(albumUri)
  }

  function advanceAfterAlbum(albumUri: string) {
    if (selectedAlbum.value?.albumUri !== albumUri) return
    selectedId.value = nextPendingAfter(albums.value, albumUri)
  }

  function selectAlbum(albumId: string) {
    selectedId.value = albumId
  }

  function clearSession() {
    albums.value = []
    selectedId.value = null
    sourceLabel.value = null
    parseError.value = null
    showInLibrary.value = false
    matchingLibrary.value = false
    playlists.value = []
    libraryAlbums.value = []
    syncPlaylistId.value = null
    autoDetectedPlaylistId.value = null
    syncError.value = null
    syncingInLibrary.value = false
    automationEnabled.value = false
    importSource.value = null
  }

  return {
    albums,
    selectedId,
    sourceLabel,
    parseError,
    parsing,
    matchingLibrary,
    showInLibrary,
    playlists,
    libraryAlbums,
    syncPlaylistId,
    autoDetectedPlaylistId,
    syncPlaylist,
    syncError,
    syncingInLibrary,
    automationEnabled,
    importSource,
    syncableAlbums,
    hasSession,
    selectedAlbum,
    inLibraryAlbums,
    importedCount,
    pendingCount,
    skippedCount,
    displayedAlbums,
    loadFiles,
    loadV1FromRepo,
    markInLibrary,
    handleImported,
    syncInLibraryAlbums,
    setSyncPlaylistId,
    startAutomation,
    stopAutomation,
    skipAlbum,
    selectAlbum,
    advanceToNextPending,
    clearSession,
  }
})
