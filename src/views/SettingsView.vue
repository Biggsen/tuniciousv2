<script setup lang="ts">
import { ref, watch } from 'vue'

import PlaceholderPage from '@/components/PlaceholderPage.vue'
import { getDefaultMusicBrainzUserAgent } from '@/lib/musicbrainz/userAgent'
import { updateUserSettings } from '@/lib/userProfile'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const musicbrainzUserAgent = ref('')
const saving = ref(false)
const saved = ref(false)
const saveError = ref<string | null>(null)

watch(
  () => auth.profile?.settings.musicbrainzUserAgent,
  (value) => {
    musicbrainzUserAgent.value = value ?? ''
  },
  { immediate: true },
)

async function saveMusicBrainzUserAgent() {
  if (!auth.user) return

  saving.value = true
  saved.value = false
  saveError.value = null

  try {
    await updateUserSettings(auth.user.uid, {
      musicbrainzUserAgent: musicbrainzUserAgent.value,
    })
    await auth.refreshProfile()
    saved.value = true
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to save settings'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-8">
    <PlaceholderPage
      title="Account"
      description="Signed-in user details."
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

    <section class="rounded-xl border border-border bg-surface-raised/50 p-6">
      <h2 class="text-lg font-medium">MusicBrainz</h2>
      <p class="mt-2 text-sm text-text-muted">
        MusicBrainz requires a descriptive User-Agent (app name + contact email).
        Leave blank to use the app default.
      </p>

      <label class="mt-4 block text-sm">
        <span class="text-text-muted">User-Agent override</span>
        <input
          v-model="musicbrainzUserAgent"
          type="text"
          :placeholder="getDefaultMusicBrainzUserAgent()"
          class="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </label>

      <p class="mt-2 text-xs text-text-muted">
        Default: {{ getDefaultMusicBrainzUserAgent() }}
      </p>

      <div class="mt-4 flex items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
          :disabled="saving"
          @click="saveMusicBrainzUserAgent"
        >
          Save
        </button>
        <span v-if="saved" class="text-sm text-emerald-400">Saved</span>
        <span v-if="saveError" class="text-sm text-red-300">{{ saveError }}</span>
      </div>
    </section>
  </div>
</template>
