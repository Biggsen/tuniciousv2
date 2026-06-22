<script setup lang="ts">
import PlaceholderPage from '@/components/PlaceholderPage.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <PlaceholderPage
    title="Album detail"
    phase="Phase 2"
    :description="`Album ${route.params.id} — tracklist, play, and YouTube resolve status.`"
  />
</template>
