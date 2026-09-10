<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import {
  formatStageHistoryDate,
  loadAlbumPipelineHistory,
  type AlbumPipelineHistoryGroup,
} from '@/lib/pipeline/albumHistory'

const props = defineProps<{
  uid: string
  albumId: string
}>()

const groups = ref<AlbumPipelineHistoryGroup[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    groups.value = await loadAlbumPipelineHistory(props.uid, props.albumId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load stage history'
    groups.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

watch(
  () => [props.uid, props.albumId],
  () => {
    void load()
  },
)
</script>

<template>
  <section v-if="loading || error || groups.length" class="mt-8">
    <h3 class="mb-3 text-sm font-medium uppercase tracking-wide text-text-muted">
      Pipeline history
    </h3>

    <p v-if="loading" class="text-sm text-text-muted">Loading history…</p>
    <p v-else-if="error" class="text-sm text-red-300">{{ error }}</p>

    <div v-else class="space-y-5">
      <div v-for="group in groups" :key="group.pipelineId">
        <p class="mb-2 text-sm font-medium text-text">{{ group.pipelineName }}</p>
        <ol class="space-y-1.5 border-l border-border pl-4">
          <li
            v-for="row in group.rows"
            :key="row.membershipId"
            class="relative text-sm"
          >
            <span
              class="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full"
              :class="row.isCurrent ? 'bg-accent' : 'bg-text-muted/50'"
            />
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span :class="row.isCurrent ? 'font-medium text-text' : 'text-text'">
                {{ row.stageName }}
              </span>
              <span class="text-xs text-text-muted">
                {{ formatStageHistoryDate(row.addedAt) }}
                <template v-if="row.removedAt">
                  → {{ formatStageHistoryDate(row.removedAt) }}
                </template>
                <template v-else>
                  · current
                </template>
              </span>
            </div>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>
