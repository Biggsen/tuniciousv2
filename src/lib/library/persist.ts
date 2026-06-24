const UNRESOLVED_ONLY_KEY = 'tunicious.library.unresolvedOnly'

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
