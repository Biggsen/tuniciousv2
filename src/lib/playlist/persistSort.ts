import type { PlaylistSortField } from '@/lib/playlist/sortMembers'

const SORT_KEY = 'tunicious.playlist.sort'
const SEARCH_QUERY_KEY = 'tunicious.playlist.searchQuery'

const SORT_FIELDS: PlaylistSortField[] = ['date-added', 'title', 'artist', 'year']

export interface PlaylistSortPreference {
  field: PlaylistSortField
  ascending: boolean
}

const DEFAULT_SORT: PlaylistSortPreference = {
  field: 'date-added',
  ascending: false,
}

function isSortField(value: unknown): value is PlaylistSortField {
  return typeof value === 'string' && SORT_FIELDS.includes(value as PlaylistSortField)
}

export function loadPlaylistSortPreference(): PlaylistSortPreference {
  try {
    const raw = localStorage.getItem(SORT_KEY)
    if (!raw) return { ...DEFAULT_SORT }
    const parsed = JSON.parse(raw) as Partial<PlaylistSortPreference>
    return {
      field: isSortField(parsed.field) ? parsed.field : DEFAULT_SORT.field,
      ascending: typeof parsed.ascending === 'boolean' ? parsed.ascending : DEFAULT_SORT.ascending,
    }
  } catch {
    return { ...DEFAULT_SORT }
  }
}

export function savePlaylistSortPreference(preference: PlaylistSortPreference): void {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(preference))
  } catch {
    // Storage unavailable — preference still works for this session.
  }
}

export function loadPlaylistSearchQuery(): string {
  try {
    return localStorage.getItem(SEARCH_QUERY_KEY) ?? ''
  } catch {
    return ''
  }
}

export function savePlaylistSearchQuery(value: string): void {
  try {
    localStorage.setItem(SEARCH_QUERY_KEY, value)
  } catch {
    // Storage unavailable — search still works for this session.
  }
}
