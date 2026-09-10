import type { Timestamp } from 'firebase/firestore'

import type { Playlist } from '@/types/library'

export type PipelineRole = 'source' | 'transient' | 'terminal' | 'sink'

export type PipelineTemplateId = 'evaluation' | 'filter'

export type StarRating = 1 | 2 | 3 | 4 | 5

export type RatingSource = 'manual' | 'pipeline'

export type WorkflowAction = 'start' | 'yes' | 'no'

export interface Pipeline {
  id: string
  name: string
  templateId?: PipelineTemplateId
  createdAt: Date
  updatedAt?: Date
}

export interface PipelineDocument {
  id: string
  name: string
  templateId?: PipelineTemplateId
  createdAt: Timestamp
  updatedAt?: Timestamp
}

export interface Stage {
  id: string
  pipelineId: string
  playlistId: string
  name: string
  pipelineRole: PipelineRole
  nextStageId?: string
  terminationStageId?: string
  outcomeRating?: StarRating
  createdAt: Date
}

export interface StageDocument {
  id: string
  pipelineId: string
  playlistId: string
  name: string
  pipelineRole: PipelineRole
  nextStageId?: string
  terminationStageId?: string
  outcomeRating?: StarRating
  createdAt: Timestamp
}

export interface StageMembership {
  id: string
  albumId: string
  pipelineId: string
  stageId: string
  pipelineRole: PipelineRole
  addedAt: Date
  removedAt?: Date
  /** Closed membership this row advanced from (Start/Yes/No). Cleared on undo reopen. */
  previousMembershipId?: string
}

export interface StageMembershipDocument {
  id: string
  albumId: string
  pipelineId: string
  stageId: string
  pipelineRole: PipelineRole
  addedAt: Timestamp
  removedAt?: Timestamp | null
  previousMembershipId?: string | null
}

export interface PipelineGraph {
  pipeline: Pipeline
  stages: Stage[]
  playlists: Playlist[]
}
