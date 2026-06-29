<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import {
  EVALUATION_FUNNEL_DISPLAY_ORDER,
  EVALUATION_TEMPLATE_STAGES,
  getEvaluationTemplateStage,
  type EvaluationStageKey,
} from '@/lib/pipeline/evaluationTemplate'
import { setupEvaluationFunnel } from '@/lib/pipeline/setupEvaluationFunnel'
import {
  buildDefaultStageMappings,
  formatStagePlaylistName,
  validatePipelineName,
} from '@/lib/pipeline/suggestPlaylist'
import {
  validateEvaluationFunnelMappings,
  type EvaluationFunnelMappings,
} from '@/lib/pipeline/validateFunnelMappings'
import type { Playlist } from '@/types/library'

const props = defineProps<{
  uid: string
  playlists: Playlist[]
  existingPipelineNames: string[]
}>()

const emit = defineEmits<{
  complete: []
  cancel: []
}>()

const funnelName = ref('')
const selections = ref<Record<EvaluationStageKey, string>>({} as Record<EvaluationStageKey, string>)
const submitting = ref(false)
const error = ref<string | null>(null)

const availablePlaylists = computed(() =>
  props.playlists.filter((playlist) => !playlist.pipelineId),
)

function initializeSelections() {
  selections.value = buildDefaultStageMappings(
    EVALUATION_TEMPLATE_STAGES,
    props.playlists,
    funnelName.value,
  ) as Record<EvaluationStageKey, string>
}

const mappings = computed((): EvaluationFunnelMappings => {
  const result = {} as EvaluationFunnelMappings

  for (const stage of EVALUATION_TEMPLATE_STAGES) {
    const value = selections.value[stage.key]
    result[stage.key] =
      value === 'create' ? { mode: 'create' } : { mode: 'existing', playlistId: value }
  }

  return result
})

const nameError = computed(() =>
  validatePipelineName(funnelName.value, props.existingPipelineNames),
)

const mappingError = computed(() =>
  validateEvaluationFunnelMappings(mappings.value, props.playlists),
)

const canSubmit = computed(
  () => !nameError.value && !mappingError.value && !submitting.value,
)

function createOptionLabel(stageName: string): string {
  const trimmed = funnelName.value.trim()
  if (!trimmed) {
    return `Create new playlist “${stageName}”`
  }
  return `Create new playlist “${formatStagePlaylistName(trimmed, stageName)}”`
}

async function handleSubmit() {
  if (!canSubmit.value) return

  submitting.value = true
  error.value = null

  try {
    await setupEvaluationFunnel(props.uid, {
      name: funnelName.value.trim(),
      mappings: mappings.value,
    })
    emit('complete')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to set up evaluation funnel'
  } finally {
    submitting.value = false
  }
}

onMounted(initializeSelections)

watch(
  () => [props.playlists, funnelName.value] as const,
  () => {
    if (!submitting.value) {
      initializeSelections()
    }
  },
)
</script>

<template>
  <div class="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-5">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-lg font-semibold">Set up evaluation funnel</h3>
        <p class="mt-1 max-w-2xl text-sm text-text-muted">
          Name this funnel (e.g. Known Artists, New Artists), then map each stage to an existing
          playlist or create a new one. Albums already on mapped playlists are kept.
        </p>
      </div>
      <button
        type="button"
        class="text-sm text-text-muted transition-colors hover:text-text"
        :disabled="submitting"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>

    <label class="mb-4 block">
      <span class="mb-1.5 block text-sm font-medium">Funnel name</span>
      <input
        v-model="funnelName"
        type="text"
        required
        placeholder="Known Artists"
        class="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        :disabled="submitting"
      />
    </label>

    <ul class="space-y-3">
      <li
        v-for="stageKey in EVALUATION_FUNNEL_DISPLAY_ORDER"
        :key="stageKey"
        class="grid gap-2 rounded-lg border border-border bg-surface px-3 py-3 sm:grid-cols-[8rem_1fr]"
      >
        <div>
          <p class="font-medium">{{ getEvaluationTemplateStage(stageKey).name }}</p>
          <p class="text-xs capitalize text-text-muted">
            {{ getEvaluationTemplateStage(stageKey).pipelineRole }}
          </p>
        </div>

        <select
          v-model="selections[stageKey]"
          class="min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          :disabled="submitting"
        >
          <option value="create">{{ createOptionLabel(getEvaluationTemplateStage(stageKey).name) }}</option>
          <option
            v-for="playlist in availablePlaylists"
            :key="playlist.id"
            :value="playlist.id"
            :disabled="
              Object.entries(selections).some(
                ([key, playlistId]) => key !== stageKey && playlistId === playlist.id,
              )
            "
          >
            {{ playlist.name }}
          </option>
        </select>
      </li>
    </ul>

    <p v-if="nameError" class="mt-4 text-sm text-amber-200">{{ nameError }}</p>
    <p v-else-if="mappingError" class="mt-4 text-sm text-amber-200">{{ mappingError }}</p>
    <p v-if="error" class="mt-4 text-sm text-red-300">{{ error }}</p>

    <div class="mt-4 flex flex-wrap gap-3">
      <button
        type="button"
        class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-muted disabled:opacity-50"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        {{ submitting ? 'Setting up…' : 'Confirm setup' }}
      </button>
      <p class="self-center text-xs text-text-muted">
        {{
          Object.values(selections).filter((value) => value !== 'create').length
        }}
        existing ·
        {{ Object.values(selections).filter((value) => value === 'create').length }} new
      </p>
    </div>
  </div>
</template>
