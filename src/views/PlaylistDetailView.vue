<script setup lang="ts">
import PlaceholderPage from '@/components/PlaceholderPage.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <PlaceholderPage
    title="Playlist detail"
    phase="Phase 3"
    :description="`Playlist ${route.params.id} — members, reorder, add albums, play.`"
  />
</template>
