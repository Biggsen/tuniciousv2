<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  if (window.opener) {
    window.opener.postMessage({ type: 'lastfm-auth-callback' }, window.location.origin)
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4">
    <p class="text-sm text-text-muted">Last.fm authentication callback — wired in Phase 7.</p>
  </div>
</template>
