<script setup lang="ts">
defineProps<{
  message?: string
}>()
</script>

<template>
  <div class="flex items-center gap-3 py-12 text-sm text-text-muted">
    <span
      class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
    />
    {{ message ?? 'Loading from MusicBrainz…' }}
  </div>
</template>
