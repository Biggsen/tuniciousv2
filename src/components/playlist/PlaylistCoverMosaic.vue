<script setup lang="ts">
import { computed } from 'vue'

import { PLAYLIST_MOSAIC_SIZE } from '@/lib/playlist/mosaic'

const props = withDefaults(
  defineProps<{
    urls?: string[]
  }>(),
  { urls: () => [] },
)

const showMosaic = computed(() => props.urls.length >= PLAYLIST_MOSAIC_SIZE)
const singleUrl = computed(() => props.urls[0] || '')
const slots = Array.from({ length: PLAYLIST_MOSAIC_SIZE }, (_, index) => index)
</script>

<template>
  <div
    class="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-raised"
    aria-hidden="true"
  >
    <div v-if="showMosaic" class="grid h-full w-full grid-cols-2 grid-rows-2">
      <div v-for="index in slots" :key="index" class="min-h-0 min-w-0 bg-surface">
        <img
          v-if="props.urls[index]"
          :src="props.urls[index]"
          alt=""
          class="h-full w-full object-cover"
        />
      </div>
    </div>
    <img
      v-else-if="singleUrl"
      :src="singleUrl"
      alt=""
      class="h-full w-full object-cover"
    />
  </div>
</template>
