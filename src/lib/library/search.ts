export function matchesLibrarySearch(query: string, ...fields: (string | undefined)[]): boolean {
  const term = query.trim().toLowerCase()
  if (!term) return true

  return fields.some((field) => field?.toLowerCase().includes(term))
}
