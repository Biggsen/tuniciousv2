<script setup lang="ts">
import { computed } from 'vue'

import { pickArtistImageSmall } from '@/lib/artist/artistImage'
import type { Artist } from '@/types/library'

const props = withDefaults(
  defineProps<{
    artist: Pick<Artist, 'name' | 'imageUrlSmall' | 'imageUrlLarge'>
    size?: 'sm' | 'md' | 'lg'
    rounded?: 'md' | 'full'
  }>(),
  {
    size: 'md',
    rounded: 'md',
  },
)

const imageUrl = computed(() => pickArtistImageSmall(props.artist))

const initial = computed(() => props.artist.name.trim().charAt(0).toUpperCase() || '?')

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-10 w-10 text-xs'
    case 'lg':
      return 'h-32 w-32 text-3xl'
    default:
      return 'h-12 w-12 text-sm'
  }
})

const roundedClass = computed(() => (props.rounded === 'full' ? 'rounded-full' : 'rounded-lg'))
</script>

<template>
  <div
    class="shrink-0 overflow-hidden bg-surface"
    :class="[sizeClass, roundedClass]"
  >
    <img
      v-if="imageUrl"
      :src="imageUrl"
      :alt="artist.name"
      loading="lazy"
      decoding="async"
      class="h-full w-full object-cover"
    />
    <div
      v-else
      class="flex h-full w-full items-center justify-center font-medium text-text-muted"
    >
      {{ initial }}
    </div>
  </div>
</template>
