<script setup lang="ts">
import { computed } from 'vue'

import type { StarRating } from '@/types/pipeline'

const props = withDefaults(
  defineProps<{
    rating?: StarRating
    editable?: boolean
    label?: string
    size?: 'sm' | 'md'
  }>(),
  {
    editable: false,
    size: 'md',
  },
)

const emit = defineEmits<{
  change: [rating: StarRating | null]
}>()

const stars = [1, 2, 3, 4, 5] as const

const starClass = computed(() => (props.size === 'sm' ? 'text-sm' : 'text-lg'))

function onStarClick(value: StarRating) {
  if (!props.editable) return
  if (props.rating === value) {
    emit('change', null)
    return
  }
  emit('change', value)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-0.5" :class="starClass">
      <button
        v-for="value in stars"
        :key="value"
        type="button"
        class="leading-none transition-colors"
        :class="[
          editable ? 'cursor-pointer' : 'cursor-default',
          rating != null && value <= rating ? 'text-amber-300' : 'text-text-muted/35',
          editable ? 'hover:text-amber-200' : '',
        ]"
        :aria-label="editable ? `Rate ${value} stars` : `${value} stars`"
        :disabled="!editable"
        @click="onStarClick(value)"
      >
        ★
      </button>
    </div>
    <p v-if="label" class="text-[11px] text-text-muted">{{ label }}</p>
  </div>
</template>
