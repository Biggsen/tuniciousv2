<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import {
  buildFunnelDisplayOrder,
  FUNNEL_TEMPLATES,
  getFunnelTemplate,
  getTemplateStage,
} from '@/lib/pipeline/funnelTemplates'
import { setupFunnel } from '@/lib/pipeline/setupEvaluationFunnel'
import {
  buildDefaultStageMappings,
  formatStagePlaylistName,
  validatePipelineName,
} from '@/lib/pipeline/suggestPlaylist'
import {
  validateFunnelMappings,
  type FunnelStageMappings,
} from '@/lib/pipeline/validateFunnelMappings'
import type { Playlist } from '@/types/library'
import type { PipelineTemplateId } from '@/types/pipeline'

const props = defineProps<{
  uid: string
  playlists: Playlist[]
  existingPipelineNames: string[]
}>()

const emit = defineEmits<{
  complete: []
  cancel: []
}>()

const templateId = ref<PipelineTemplateId>('filter')
const funnelName = ref('')
const selections = ref<Record<string, string>>({})
const submitting = ref(false)
const error = ref<string | null>(null)

const activeTemplate = computed(() => getFunnelTemplate(templateId.value))

const displayOrder = computed(() => buildFunnelDisplayOrder(activeTemplate.value.stages))

const availablePlaylists = computed(() =>
  props.playlists.filter((playlist) => !playlist.pipelineId),
)

function initializeSelections() {
  selections.value = buildDefaultStageMappings(
    activeTemplate.value.stages,
    props.playlists,
    funnelName.value,
  )
}

const mappings = computed((): FunnelStageMappings => {
  const result: FunnelStageMappings = {}

  for (const stage of activeTemplate.value.stages) {
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
  validateFunnelMappings(templateId.value, mappings.value, props.playlists),
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
    await setupFunnel(props.uid, {
      name: funnelName.value.trim(),
      templateId: templateId.value,
      mappings: mappings.value,
    })
    emit('complete')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to set up funnel'
  } finally {
    submitting.value = false
  }
}

onMounted(initializeSelections)

watch(templateId, () => {
  if (!submitting.value) {
    initializeSelections()
  }
})

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
        <h3 class="text-lg font-semibold">Set up funnel</h3>
        <p class="mt-1 max-w-2xl text-sm text-text-muted">
          Choose a template, name the funnel, then map each stage to an existing playlist or create
          a new one. Albums already on mapped playlists are kept.
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

    <fieldset class="mb-4">
      <legend class="mb-2 text-sm font-medium">Template</legend>
      <div class="flex flex-col gap-2 sm:flex-row">
        <label
          v-for="template in FUNNEL_TEMPLATES"
          :key="template.id"
          class="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors"
          :class="
            templateId === template.id
              ? 'border-accent/50 bg-accent/10'
              : 'border-border bg-surface hover:border-accent/30'
          "
        >
          <input
            v-model="templateId"
            type="radio"
            class="mt-1"
            :value="template.id"
            :disabled="submitting"
          />
          <span>
            <span class="font-medium">{{ template.label }}</span>
            <span class="mt-0.5 block text-xs text-text-muted">{{ template.description }}</span>
          </span>
        </label>
      </div>
    </fieldset>

    <label class="mb-4 block">
      <span class="mb-1.5 block text-sm font-medium">Funnel name</span>
      <input
        v-model="funnelName"
        type="text"
        required
        :placeholder="templateId === 'filter' ? 'First Pass' : 'Known Artists'"
        class="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        :disabled="submitting"
      />
    </label>

    <ul class="space-y-3">
      <li
        v-for="stageKey in displayOrder"
        :key="stageKey"
        class="grid gap-2 rounded-lg border border-border bg-surface px-3 py-3 sm:grid-cols-[8rem_1fr]"
      >
        <div>
          <p class="font-medium">{{ getTemplateStage(activeTemplate, stageKey).name }}</p>
          <p class="text-xs capitalize text-text-muted">
            {{ getTemplateStage(activeTemplate, stageKey).pipelineRole }}
            <template v-if="getTemplateStage(activeTemplate, stageKey).outcomeRating">
              · {{ getTemplateStage(activeTemplate, stageKey).outcomeRating }}★
            </template>
          </p>
        </div>

        <select
          v-model="selections[stageKey]"
          class="min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          :disabled="submitting"
        >
          <option value="create">
            {{ createOptionLabel(getTemplateStage(activeTemplate, stageKey).name) }}
          </option>
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
