const UNRESOLVED_ONLY_KEY = 'tunicious.library.unresolvedOnly'
const SEARCH_QUERY_KEY = 'tunicious.library.searchQuery'

export function loadUnresolvedOnlyFilter(): boolean {
  try {
    return localStorage.getItem(UNRESOLVED_ONLY_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveUnresolvedOnlyFilter(value: boolean): void {
  try {
    localStorage.setItem(UNRESOLVED_ONLY_KEY, String(value))
  } catch {
    // Storage unavailable — filter still works for this session.
  }
}

export function loadLibrarySearchQuery(): string {
  try {
    return localStorage.getItem(SEARCH_QUERY_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveLibrarySearchQuery(value: string): void {
  try {
    localStorage.setItem(SEARCH_QUERY_KEY, value)
  } catch {
    // Storage unavailable — search still works for this session.
  }
}
