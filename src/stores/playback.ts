import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { buildQueueFromPlaylist } from '@/lib/playback/queue'
import { getMappingsForTrackIds } from '@/lib/youtube/firestore'
import type { PlaylistMember } from '@/types/library'
import type { PlaybackQueueItem } from '@/types/playback'

export const usePlaybackStore = defineStore('playback', () => {
  const queue = ref<PlaybackQueueItem[]>([])
  const sourcePlaylistId = ref<string | null>(null)

  const trackCount = computed(() => queue.value.length)
  const resolvedCount = computed(() => queue.value.filter((item) => item.videoId).length)
  const unresolvedCount = computed(() => queue.value.filter((item) => !item.videoId).length)

  async function setQueueFromPlaylist(members: PlaylistMember[], playlistId: string, uid: string) {
    const trackIds = members.flatMap((member) => member.album.tracks.map((track) => track.id))
    const mappings = await getMappingsForTrackIds(uid, trackIds)
    queue.value = buildQueueFromPlaylist(members, playlistId, mappings)
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
    resolvedCount,
    unresolvedCount,
    setQueueFromPlaylist,
    clearQueue,
  }
})
