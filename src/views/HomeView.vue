<script setup lang="ts">
import PlaceholderPage from '@/components/PlaceholderPage.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <PlaceholderPage
    title="Home"
    phase="Coming in Phase 8"
    description="Recent listens and quick resume will live here."
  >
    <p class="mt-4 text-sm text-text-muted">
      Signed in as {{ auth.profile?.displayName ?? auth.user?.email }}.
      Profile created {{ auth.profile?.createdAt.toLocaleDateString() }}.
    </p>
  </PlaceholderPage>
</template>
