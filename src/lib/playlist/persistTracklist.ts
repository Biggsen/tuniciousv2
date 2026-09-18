const TRACKLIST_OPEN_KEY = 'tunicious.playlist.tracklistOpen'

function loadOpenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(TRACKLIST_OPEN_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0))
  } catch {
    return new Set()
  }
}

function saveOpenIds(ids: Set<string>): void {
  try {
    localStorage.setItem(TRACKLIST_OPEN_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage unavailable — preference still works for this session.
  }
}

export function loadPlaylistTracklistOpen(playlistId: string): boolean {
  if (!playlistId) return false
  return loadOpenIds().has(playlistId)
}

export function savePlaylistTracklistOpen(playlistId: string, open: boolean): void {
  if (!playlistId) return
  const ids = loadOpenIds()
  if (open) {
    ids.add(playlistId)
  } else {
    ids.delete(playlistId)
  }
  saveOpenIds(ids)
}
