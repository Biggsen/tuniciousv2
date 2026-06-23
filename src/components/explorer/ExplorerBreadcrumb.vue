<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineProps<{
  items: { label: string; to?: { name: string; params?: Record<string, string> } }[]
}>()
</script>

<template>
  <nav class="mb-6 flex flex-wrap items-center gap-1 text-sm text-text-muted">
    <template v-for="(item, index) in items" :key="`${item.label}-${index}`">
      <span v-if="index > 0" class="text-border">/</span>
      <RouterLink
        v-if="item.to"
        :to="item.to"
        class="transition-colors hover:text-text"
      >
        {{ item.label }}
      </RouterLink>
      <span v-else class="text-text">{{ item.label }}</span>
    </template>
  </nav>
</template>
