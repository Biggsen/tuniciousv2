<script setup lang="ts">
defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
}>()

defineSlots<{
  default?: () => unknown
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'confirm-dialog-title'"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/60"
        aria-label="Close dialog"
        :disabled="busy"
        @click="emit('cancel')"
      />
      <div
        class="relative w-full max-w-md rounded-xl border border-border bg-surface-raised p-5 shadow-xl"
      >
        <h2 id="confirm-dialog-title" class="text-lg font-semibold">
          {{ title }}
        </h2>
        <p class="mt-2 whitespace-pre-line text-sm text-text-muted">
          {{ message }}
        </p>
        <div v-if="$slots.default" class="mt-4">
          <slot />
        </div>
        <div class="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
            :disabled="busy"
            @click="emit('cancel')"
          >
            {{ cancelLabel ?? 'Cancel' }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            :class="
              destructive
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-accent hover:bg-accent-muted'
            "
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ busy ? 'Working…' : (confirmLabel ?? 'Confirm') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
