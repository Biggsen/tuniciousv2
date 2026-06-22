<script setup lang="ts">
import PlaceholderPage from '@/components/PlaceholderPage.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <PlaceholderPage
    title="Artist detail"
    phase="Phase 2"
    :description="`Artist ${route.params.id} — albums in your library.`"
  />
</template>
