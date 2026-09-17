<script setup lang="ts">
defineProps<{
  loved: boolean
  canToggle: boolean
  busy?: boolean
}>()

defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    v-if="canToggle"
    type="button"
    class="shrink-0 text-xs leading-none transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
    :class="loved ? 'text-red-400' : 'text-text-muted/40'"
    :disabled="busy"
    :title="loved ? 'Unlove on Last.fm' : 'Love on Last.fm'"
    :aria-label="loved ? 'Unlove on Last.fm' : 'Love on Last.fm'"
    :aria-pressed="loved"
    @click.stop="$emit('toggle')"
  >
    {{ loved ? '♥' : '♡' }}
  </button>
  <span
    v-else
    class="shrink-0 text-xs leading-none"
    :class="loved ? 'text-red-400' : 'text-text-muted/40'"
    :title="loved ? 'Loved on Last.fm' : 'Not loved on Last.fm'"
  >
    {{ loved ? '♥' : '♡' }}
  </span>
</template>
