import { defineStore } from 'pinia'
import { ref } from 'vue'

import { listUserLibraryCards, type LibraryAlbumCard } from '@/lib/album/firestore'
import { listArtistsByIds } from '@/lib/artist/firestore'
import { getMappingsForTrackIds } from '@/lib/youtube/firestore'
import type { Artist } from '@/types/library'
import type { TrackYouTubeMapping } from '@/types/youtube'

export const useLibraryStore = defineStore('library', () => {
  const cards = ref<LibraryAlbumCard[]>([])
  const mappings = ref<Map<string, TrackYouTubeMapping>>(new Map())
  const artists = ref<Artist[]>([])

  const albumsUid = ref<string | null>(null)
  const artistsUid = ref<string | null>(null)
  const albumsLoading = ref(false)
  const artistsLoading = ref(false)
  const error = ref<string | null>(null)

  async function ensureAlbums(uid: string, options: { force?: boolean } = {}): Promise<void> {
    if (!options.force && albumsUid.value === uid && !albumsLoading.value) {
      return
    }

    albumsLoading.value = true
    error.value = null
    try {
      const loadedCards = await listUserLibraryCards(uid)
      const trackIds = loadedCards.flatMap((card) => card.trackIds)
      const loadedMappings = await getMappingsForTrackIds(uid, trackIds)
      cards.value = loadedCards
      mappings.value = loadedMappings
      albumsUid.value = uid
      // Artist list depends on card artistIds — force reload if albums changed.
      if (artistsUid.value === uid) {
        artistsUid.value = null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load library'
      throw err
    } finally {
      albumsLoading.value = false
    }
  }

  async function ensureArtists(uid: string, options: { force?: boolean } = {}): Promise<void> {
    await ensureAlbums(uid)
    if (!options.force && artistsUid.value === uid && !artistsLoading.value) {
      return
    }

    artistsLoading.value = true
    try {
      const artistIds = cards.value.flatMap((card) => card.artistIds)
      artists.value = await listArtistsByIds(uid, artistIds)
      artistsUid.value = uid
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load artists'
      throw err
    } finally {
      artistsLoading.value = false
    }
  }

  function invalidate(): void {
    albumsUid.value = null
    artistsUid.value = null
  }

  /** After resolving tracks on an album detail page, refresh presence without full reload. */
  function upsertMappings(next: Iterable<TrackYouTubeMapping>): void {
    const map = new Map(mappings.value)
    for (const mapping of next) {
      map.set(mapping.trackId, mapping)
    }
    mappings.value = map
  }

  function removeMappingTrackIds(trackIds: string[]): void {
    const map = new Map(mappings.value)
    for (const trackId of trackIds) {
      map.delete(trackId)
    }
    mappings.value = map
  }

  function patchCardTitle(albumId: string, title: string): void {
    cards.value = cards.value.map((card) =>
      card.id === albumId ? { ...card, title } : card,
    )
  }

  function patchCardCover(
    albumId: string,
    coverUrlSmall: string | undefined,
  ): void {
    cards.value = cards.value.map((card) =>
      card.id === albumId ? { ...card, coverUrlSmall } : card,
    )
  }

  function patchCardRating(
    albumId: string,
    patch: Pick<LibraryAlbumCard, 'rating' | 'ratingSource' | 'ratingSubmittedPipelineId'>,
  ): void {
    cards.value = cards.value.map((card) =>
      card.id === albumId
        ? {
            ...card,
            rating: patch.rating,
            ratingSource: patch.ratingSource,
            ratingSubmittedPipelineId: patch.ratingSubmittedPipelineId,
          }
        : card,
    )
  }

  function removeCard(albumId: string): void {
    cards.value = cards.value.filter((card) => card.id !== albumId)
  }

  return {
    cards,
    mappings,
    artists,
    albumsLoading,
    artistsLoading,
    error,
    ensureAlbums,
    ensureArtists,
    invalidate,
    upsertMappings,
    removeMappingTrackIds,
    patchCardTitle,
    patchCardCover,
    patchCardRating,
    removeCard,
  }
})
