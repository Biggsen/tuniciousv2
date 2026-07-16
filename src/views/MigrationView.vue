<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { listAlbums } from '@/lib/album/firestore'
import { applyV1AlbumHistory } from '@/lib/migrate/v1MigrationApply'
import { dryRunMatchV1Albums } from '@/lib/migrate/v1MigrationMatch'
import {
  countV1MigrationAlbums,
  getV1MigrationMeta,
  getV1PlaylistIdMap,
  listV1MigrationAlbums,
  updateV1MigrationAlbumState,
} from '@/lib/migrate/v1MigrationFirestore'
import { useAuthStore } from '@/stores/auth'
import type { V1MigrationAlbum, V1MigrationCounts, V1MigrationMeta, V1PlaylistIdMap } from '@/types/v1Migration'

const auth = useAuthStore()

const loading = ref(true)
const error = ref<string | null>(null)
const message = ref<string | null>(null)
const meta = ref<V1MigrationMeta | null>(null)
const playlistMap = ref<V1PlaylistIdMap | null>(null)
const albums = ref<V1MigrationAlbum[]>([])
const counts = ref<V1MigrationCounts | null>(null)

const dryRunning = ref(false)
const applying = ref(false)
const applyProgress = ref('')

const reviewAlbums = computed(() =>
  albums.value.filter(
    (album) => album.migration.status === 'suggested' || album.migration.status === 'mapped',
  ),
)

const mappedCount = computed(() => albums.value.filter((a) => a.migration.status === 'mapped').length)

const mapReady = computed(() => {
  if (!playlistMap.value?.v2PipelineId) return false
  return Object.values(playlistMap.value.stages).every((stage) => Boolean(stage.v2StageId))
})

async function refresh() {
  if (!auth.user) return
  loading.value = true
  error.value = null
  try {
    const uid = auth.user.uid
    meta.value = await getV1MigrationMeta(uid)
    const group = meta.value?.group ?? 'new'
    playlistMap.value = await getV1PlaylistIdMap(uid, group)
    albums.value = await listV1MigrationAlbums(uid)
    counts.value = await countV1MigrationAlbums(uid)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function runDryRun() {
  if (!auth.user) return
  dryRunning.value = true
  message.value = null
  error.value = null
  try {
    const library = await listAlbums(auth.user.uid)
    const results = dryRunMatchV1Albums(albums.value, library)
    let updated = 0
    for (const result of results) {
      const album = albums.value.find((row) => row.v1AlbumId === result.v1AlbumId)
      if (!album) continue
      await updateV1MigrationAlbumState(auth.user.uid, result.v1AlbumId, {
        status: result.status,
        v2AlbumId: result.v2AlbumId,
        candidates: result.candidates,
        warning: result.warning,
        note: album.migration.note,
      })
      updated++
    }
    message.value = `Dry-run updated ${updated} album(s).`
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    dryRunning.value = false
  }
}

async function confirmMapped(album: V1MigrationAlbum, v2AlbumId: string) {
  if (!auth.user) return
  await updateV1MigrationAlbumState(auth.user.uid, album.v1AlbumId, {
    status: 'mapped',
    v2AlbumId,
    candidates: album.migration.candidates,
    note: album.migration.note,
    warning: undefined,
  })
  await refresh()
}

async function skipAlbum(album: V1MigrationAlbum) {
  if (!auth.user) return
  await updateV1MigrationAlbumState(auth.user.uid, album.v1AlbumId, {
    status: 'skipped',
    note: album.migration.note ?? 'Skipped in review',
    candidates: album.migration.candidates,
  })
  await refresh()
}

async function applyMapped() {
  if (!auth.user || !playlistMap.value || !meta.value) return
  if (!mapReady.value) {
    error.value = 'Playlist map is missing v2 stage ids.'
    return
  }
  const toApply = albums.value.filter((album) => album.migration.status === 'mapped')
  if (toApply.length === 0) {
    message.value = 'No mapped albums to apply.'
    return
  }
  if (
    !window.confirm(
      `Apply pipeline history for ${toApply.length} mapped album(s) into the New funnel? This writes stage_memberships.`,
    )
  ) {
    return
  }

  applying.value = true
  error.value = null
  message.value = null
  let ok = 0
  let failed = 0
  try {
    for (let i = 0; i < toApply.length; i++) {
      const album = toApply[i]
      applyProgress.value = `${i + 1} / ${toApply.length}: ${album.albumTitle}`
      const result = await applyV1AlbumHistory({
        uid: auth.user.uid,
        album,
        playlistMap: playlistMap.value,
        group: meta.value.group,
      })
      if (result.ok) {
        ok++
        await updateV1MigrationAlbumState(auth.user.uid, album.v1AlbumId, {
          status: 'applied',
          v2AlbumId: album.migration.v2AlbumId,
          membershipCount: result.membershipCount,
          appliedAt: new Date(),
        })
      } else {
        failed++
        await updateV1MigrationAlbumState(auth.user.uid, album.v1AlbumId, {
          ...album.migration,
          status: 'mapped',
          warning: result.error,
        })
      }
    }
    message.value = `Apply finished: ${ok} ok, ${failed} failed.`
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    applying.value = false
    applyProgress.value = ''
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8">
    <header class="space-y-2">
      <p class="text-sm text-text-muted">
        <RouterLink to="/settings" class="text-accent hover:underline">Settings</RouterLink>
        <span class="mx-2">/</span>
        v1 pipeline migration
      </p>
      <h1 class="text-2xl font-semibold tracking-tight">Migration</h1>
      <p class="max-w-2xl text-sm text-text-muted">
        Review staged v1 funnel history, match albums to the v2 library, then apply
        <code class="text-text">StageMembership</code> rows. Staging is uploaded with
        <code class="text-text">npm run migrate:upload-v1</code>.
      </p>
    </header>

    <p v-if="loading" class="text-sm text-text-muted">Loading staging…</p>
    <p v-else-if="error" class="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
      {{ error }}
    </p>
    <p
      v-else-if="message"
      class="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-text"
    >
      {{ message }}
    </p>

    <section v-if="!loading" class="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
      <h2 class="text-sm font-medium uppercase tracking-wide text-text-muted">Setup</h2>
      <dl class="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-text-muted">Staging</dt>
          <dd>{{ meta ? `${meta.albumCount} albums · group “${meta.group}”` : 'Not uploaded yet' }}</dd>
        </div>
        <div>
          <dt class="text-text-muted">v1 → v2 uid</dt>
          <dd class="truncate font-mono text-xs">
            {{ meta ? `${meta.v1Uid} → ${meta.v2Uid}` : '—' }}
          </dd>
        </div>
        <div>
          <dt class="text-text-muted">Pipeline map</dt>
          <dd>
            <span v-if="mapReady" class="text-emerald-300">Linked ({{ playlistMap?.v2PipelineName ?? 'New' }})</span>
            <span v-else class="text-amber-200">Missing or incomplete</span>
          </dd>
        </div>
        <div>
          <dt class="text-text-muted">Source</dt>
          <dd class="truncate text-xs text-text-muted">{{ meta?.sourceExport ?? '—' }}</dd>
        </div>
      </dl>
      <p v-if="!meta" class="text-sm text-text-muted">
        From the repo root run
        <code class="text-text">npm run migrate:upload-v1</code>
        (requires <code class="text-text">firebase login</code>), then refresh.
      </p>
      <button
        type="button"
        class="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-white/5 hover:text-text"
        :disabled="loading"
        @click="refresh"
      >
        Refresh
      </button>
    </section>

    <section v-if="counts" class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <div
        v-for="item in [
          ['total', counts.total],
          ['pending', counts.pending],
          ['suggested', counts.suggested],
          ['mapped', counts.mapped],
          ['applied', counts.applied],
          ['unmatched', counts.unmatched],
          ['skipped', counts.skipped],
        ] as const"
        :key="item[0]"
        class="rounded-xl border border-border bg-surface-raised px-3 py-3"
      >
        <p class="text-xs uppercase tracking-wide text-text-muted">{{ item[0] }}</p>
        <p class="mt-1 text-xl font-semibold">{{ item[1] }}</p>
      </div>
    </section>

    <section v-if="meta" class="flex flex-wrap gap-3">
      <button
        type="button"
        class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        :disabled="dryRunning || applying || !albums.length"
        @click="runDryRun"
      >
        {{ dryRunning ? 'Matching…' : 'Dry-run match' }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50"
        :disabled="applying || dryRunning || mappedCount === 0 || !mapReady"
        @click="applyMapped"
      >
        {{ applying ? 'Applying…' : `Apply mapped (${mappedCount})` }}
      </button>
      <p v-if="applyProgress" class="self-center text-sm text-text-muted">{{ applyProgress }}</p>
    </section>

    <section v-if="reviewAlbums.length" class="space-y-3">
      <h2 class="text-sm font-medium uppercase tracking-wide text-text-muted">
        Review queue ({{ reviewAlbums.length }})
      </h2>
      <ul class="space-y-3">
        <li
          v-for="album in reviewAlbums"
          :key="album.v1AlbumId"
          class="rounded-xl border border-border bg-surface-raised p-4"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="font-medium">{{ album.albumTitle }}</p>
              <p class="text-sm text-text-muted">{{ album.artistName }}</p>
              <p class="mt-1 text-xs text-text-muted">
                status: {{ album.migration.status }}
                <span v-if="album.migration.warning"> · {{ album.migration.warning }}</span>
              </p>
            </div>
            <button
              type="button"
              class="text-sm text-text-muted hover:text-text"
              @click="skipAlbum(album)"
            >
              Skip
            </button>
          </div>

          <ul v-if="album.migration.candidates?.length" class="mt-3 space-y-2">
            <li
              v-for="candidate in album.migration.candidates"
              :key="candidate.albumId"
              class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <div>
                <p>{{ candidate.title }}</p>
                <p class="text-xs text-text-muted">
                  {{ candidate.artist }} · {{ candidate.trackCount }} tracks
                  <span v-if="album.migration.v2AlbumId === candidate.albumId"> · selected</span>
                </p>
              </div>
              <button
                type="button"
                class="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                @click="confirmMapped(album, candidate.albumId)"
              >
                Use this
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section v-else-if="meta && !loading" class="text-sm text-text-muted">
      No albums in the review queue. Run dry-run match, or confirm mapped albums and apply.
    </section>
  </div>
</template>
