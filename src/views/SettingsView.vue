<script setup lang="ts">
import PlaceholderPage from '@/components/PlaceholderPage.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <PlaceholderPage
    title="Settings"
    phase="Phase 0 shell"
    description="Account, MusicBrainz User-Agent, and Last.fm connection."
  >
    <dl class="mt-4 space-y-3 text-sm">
      <div>
        <dt class="text-text-muted">Display name</dt>
        <dd>{{ auth.profile?.displayName ?? '—' }}</dd>
      </div>
      <div>
        <dt class="text-text-muted">Email</dt>
        <dd>{{ auth.profile?.email ?? '—' }}</dd>
      </div>
      <div>
        <dt class="text-text-muted">User ID</dt>
        <dd class="break-all font-mono text-xs">{{ auth.user?.uid ?? '—' }}</dd>
      </div>
    </dl>
  </PlaceholderPage>
</template>
