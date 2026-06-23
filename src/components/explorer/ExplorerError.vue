<script setup lang="ts">
defineProps<{
  message: string
}>()
</script>

<template>
  <div class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
    {{ message }}
  </div>
</template>
