/** Normalize for library search: case-fold and treat $ as S (A$AP ↔ ASAP). */
export function normalizeLibrarySearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\$/g, 's')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchesLibrarySearch(query: string, ...fields: (string | undefined)[]): boolean {
  const term = normalizeLibrarySearchText(query)
  if (!term) return true

  return fields.some((field) => {
    if (!field) return false
    return normalizeLibrarySearchText(field).includes(term)
  })
}
