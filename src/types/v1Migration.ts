import type { Timestamp } from 'firebase/firestore'

import type { PipelineRole } from '@/types/pipeline'

export type V1MigrationStatus =
  | 'pending'
  | 'suggested'
  | 'mapped'
  | 'applied'
  | 'skipped'
  | 'unmatched'

export interface V1PlaylistHistoryEntry {
  playlistId: string
  addedAt: string
  removedAt: string | null
  pipelineRole?: PipelineRole | string
  type?: string
  playlistName?: string
  category?: string
  priority?: number
  [key: string]: unknown
}

export interface V1MigrationCandidate {
  albumId: string
  title: string
  artist: string
  trackCount: number
}

export interface V1MigrationState {
  status: V1MigrationStatus
  v2AlbumId?: string
  candidates?: V1MigrationCandidate[]
  note?: string
  warning?: string
  appliedAt?: Date
  membershipCount?: number
}

export interface V1MigrationAlbum {
  v1AlbumId: string
  albumTitle: string
  artistName: string
  releaseYear?: string
  albumCover?: string
  playlistHistory: V1PlaylistHistoryEntry[]
  extras?: Record<string, unknown>
  migration: V1MigrationState
}

export interface V1MigrationAlbumDocument {
  v1AlbumId: string
  albumTitle: string
  artistName: string
  releaseYear?: string
  albumCover?: string
  playlistHistory: V1PlaylistHistoryEntry[]
  extras?: Record<string, unknown>
  migration: {
    status: V1MigrationStatus
    v2AlbumId?: string
    candidates?: V1MigrationCandidate[]
    note?: string
    warning?: string
    appliedAt?: Timestamp
    membershipCount?: number
  }
}

export interface V1PlaylistMapStage {
  inferredName: string
  pipelineRole: PipelineRole | string
  group: string
  firestoreDocId?: string
  nextStagePlaylistId?: string | null
  terminationPlaylistId?: string | null
  exitFrom?: string
  exitFromInferredName?: string
  v2StageId: string | null
  v2PlaylistId: string | null
  v2StageName?: string
}

export interface V1PlaylistIdMap {
  v1Uid: string
  v2Uid: string | null
  v2PipelineId: string | null
  v2PipelineName?: string
  group: string
  stages: Record<string, V1PlaylistMapStage>
  chain?: Array<{
    v1PlaylistId: string
    inferredName: string
    pipelineRole: string
    exitFrom?: string
  }>
}

export interface V1MigrationMeta {
  v1Uid: string
  v2Uid: string
  group: string
  v2PipelineId: string | null
  albumCount: number
  uploadedAt: Date
  sourceExport?: string
}

export interface V1MigrationMetaDocument {
  v1Uid: string
  v2Uid: string
  group: string
  v2PipelineId: string | null
  albumCount: number
  uploadedAt: Timestamp
  sourceExport?: string
}

export interface V1MigrationCounts {
  total: number
  pending: number
  suggested: number
  mapped: number
  applied: number
  skipped: number
  unmatched: number
}
