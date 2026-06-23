<script setup lang="ts">
import type { ComparedTrackRow } from '@/lib/import/types'

defineProps<{
  rows: ComparedTrackRow[]
  matchPercent: number
}>()

function rowClass(match: ComparedTrackRow['match']): string {
  switch (match) {
    case 'exact':
      return 'text-emerald-300'
    case 'partial':
      return 'text-amber-200'
    case 'mismatch':
    case 'missing-csv':
    case 'missing-mb':
      return 'text-red-300'
    default:
      return ''
  }
}

function matchLabel(match: ComparedTrackRow['match']): string {
  switch (match) {
    case 'exact':
      return 'Match'
    case 'partial':
      return 'Close'
    case 'mismatch':
      return 'Mismatch'
    case 'missing-csv':
      return 'Extra on MB'
    case 'missing-mb':
      return 'Missing on MB'
    default:
      return ''
  }
}
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="text-sm font-medium uppercase tracking-wider text-text-muted">Track comparison</h3>
      <span class="text-xs text-text-muted">{{ matchPercent }}% aligned by position</span>
    </div>

    <div class="overflow-hidden rounded-xl border border-border">
      <div
        class="grid grid-cols-[2rem_1fr_1fr_5rem] gap-2 border-b border-border bg-surface px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-text-muted"
      >
        <span>#</span>
        <span>CSV</span>
        <span>MusicBrainz</span>
        <span class="text-right">Status</span>
      </div>

      <div class="divide-y divide-border">
        <div
          v-for="row in rows"
          :key="row.position"
          class="grid grid-cols-[2rem_1fr_1fr_5rem] gap-2 px-3 py-2 text-sm"
        >
          <span class="text-text-muted tabular-nums">{{ row.position }}</span>
          <span class="min-w-0 truncate" :title="row.csvTitle">{{ row.csvTitle ?? '—' }}</span>
          <span class="min-w-0 truncate" :title="row.mbTitle">{{ row.mbTitle ?? '—' }}</span>
          <span class="text-right text-[11px] font-medium" :class="rowClass(row.match)">
            {{ matchLabel(row.match) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
