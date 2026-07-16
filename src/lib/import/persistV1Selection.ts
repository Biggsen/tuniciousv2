import type { V1FunnelGroup } from '@/lib/import/v1ExportRepo'

export interface V1ImportSelection {
  group: V1FunnelGroup
  stageId: string
}

function storageKey(uid: string): string {
  return `tunicious.import.v1Selection.${uid}`
}

export function loadV1ImportSelection(uid: string): V1ImportSelection | null {
  try {
    const raw = localStorage.getItem(storageKey(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<V1ImportSelection>
    if (
      (parsed.group === 'new' || parsed.group === 'known') &&
      typeof parsed.stageId === 'string' &&
      parsed.stageId.length > 0
    ) {
      return { group: parsed.group, stageId: parsed.stageId }
    }
    return null
  } catch {
    return null
  }
}

export function saveV1ImportSelection(uid: string, selection: V1ImportSelection): void {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(selection))
  } catch {
    // Storage unavailable — selection still works for this session.
  }
}
