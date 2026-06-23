export function normalizeArtistName(name: string): string {
  return name.trim().toLowerCase()
}

export function isVariousArtists(name: string): boolean {
  return normalizeArtistName(name) === 'various artists'
}
