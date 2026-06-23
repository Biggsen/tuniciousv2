export function buildAutoSearchQuery(artist: string, trackTitle: string): string {
  return `${artist} Topic ${trackTitle}`
}

export function buildChannelScopedSearchQuery(trackTitle: string): string {
  return trackTitle.trim()
}
