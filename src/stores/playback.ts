import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { buildQueueFromPlaylist } from '@/lib/playback/queue'
import type { PlaylistMember } from '@/types/library'
import type { PlaybackQueueItem } from '@/types/playback'

export const usePlaybackStore = defineStore('playback', () => {
  const queue = ref<PlaybackQueueItem[]>([])
  const sourcePlaylistId = ref<string | null>(null)

  const trackCount = computed(() => queue.value.length)

  function setQueueFromPlaylist(members: PlaylistMember[], playlistId: string) {
    queue.value = buildQueueFromPlaylist(members, playlistId)
    sourcePlaylistId.value = playlistId
  }

  function clearQueue() {
    queue.value = []
    sourcePlaylistId.value = null
  }

  return {
    queue,
    sourcePlaylistId,
    trackCount,
    setQueueFromPlaylist,
    clearQueue,
  }
})
