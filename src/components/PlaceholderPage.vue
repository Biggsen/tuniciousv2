<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  phase?: string
}>()
</script>

<template>
  <section class="max-w-2xl">
    <div
      class="rounded-xl border border-dashed border-border bg-surface-raised/50 p-8"
    >
      <p v-if="phase" class="mb-2 text-xs font-medium uppercase tracking-wider text-accent">
        {{ phase }}
      </p>
      <h2 class="text-lg font-medium">{{ title }}</h2>
      <p v-if="description" class="mt-2 text-sm leading-relaxed text-text-muted">
        {{ description }}
      </p>
      <slot />
    </div>
  </section>
</template>
