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
    <div class="max-w-sm text-center">
      <p class="text-sm font-medium">Last.fm authorization complete</p>
      <p class="mt-2 text-sm text-text-muted">
        You can close this window and return to Tunicious.
      </p>
    </div>
  </div>
</template>
