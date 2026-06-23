import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { markAlbumsInLibrary } from '@/lib/import/matchLibrary'
import { mergeStagedAlbums, parseSpotifyExportCsv } from '@/lib/import/parseSpotifyCsv'
import type { StagedAlbum } from '@/lib/import/types'
import { listAlbums } from '@/lib/album/firestore'
import { useAuthStore } from '@/stores/auth'

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

function firstPendingId(albumList: StagedAlbum[]): string | null {
  return albumList.find((album) => album.status === 'pending')?.id ?? null
}

export const useImportStore = defineStore('import', () => {
  const albums = ref<StagedAlbum[]>([])
  const selectedId = ref<string | null>(null)
  const sourceLabel = ref<string | null>(null)
  const parseError = ref<string | null>(null)
  const parsing = ref(false)
  const showInLibrary = ref(false)

  const hasSession = computed(() => albums.value.length > 0)

  const selectedAlbum = computed(
    () => albums.value.find((album) => album.id === selectedId.value) ?? null,
  )

  const inLibraryAlbums = computed(() => albums.value.filter((album) => album.status === 'in-library'))
  const importedCount = computed(() => albums.value.filter((album) => album.status === 'imported').length)
  const pendingCount = computed(() => albums.value.filter((album) => album.status === 'pending').length)
  const skippedCount = computed(() => albums.value.filter((album) => album.status === 'skipped').length)

  const displayedAlbums = computed(() => {
    let list = albums.value
    if (!showInLibrary.value) {
      list = list.filter((album) => album.status !== 'in-library')
    }
    return list.filter((album) => album.status !== 'skipped' && album.status !== 'imported')
  })

  async function applyLibraryMatches(staged: StagedAlbum[]): Promise<StagedAlbum[]> {
    const uid = useAuthStore().user?.uid
    if (!uid) return staged
    const library = await listAlbums(uid)
    return markAlbumsInLibrary(staged, library)
  }

  async function loadFiles(files: File[]) {
    parsing.value = true
    parseError.value = null

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
      let next = albums.value.length
        ? preserveResolvedStatus(mergeStagedAlbums([...albums.value, ...merged]), albums.value)
        : merged

      next = await applyLibraryMatches(next)

      albums.value = next
      sourceLabel.value =
        files.length === 1 ? files[0].name : `${files.length} files (${files.map((f) => f.name).join(', ')})`
      selectedId.value = firstPendingId(albums.value) ?? albums.value[0]?.id ?? null
    } catch (err) {
      parseError.value = err instanceof Error ? err.message : 'Failed to parse CSV'
    } finally {
      parsing.value = false
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

  function skipAlbum(albumUri: string) {
    albums.value = albums.value.map((album) =>
      album.albumUri === albumUri ? { ...album, status: 'skipped' } : album,
    )
    advanceAfterAlbum(albumUri)
  }

  function advanceAfterAlbum(albumUri: string) {
    if (selectedAlbum.value?.albumUri !== albumUri) return
    selectedId.value = firstPendingId(albums.value)
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
  }

  return {
    albums,
    selectedId,
    sourceLabel,
    parseError,
    parsing,
    showInLibrary,
    hasSession,
    selectedAlbum,
    inLibraryAlbums,
    importedCount,
    pendingCount,
    skippedCount,
    displayedAlbums,
    loadFiles,
    markImported,
    skipAlbum,
    selectAlbum,
    clearSession,
  }
})
