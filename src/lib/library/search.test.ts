import { describe, expect, it } from 'vitest'

import { matchesLibrarySearch, normalizeLibrarySearchText } from '@/lib/library/search'

describe('normalizeLibrarySearchText', () => {
  it('maps $ to s and strips punctuation', () => {
    expect(normalizeLibrarySearchText('Live.Love.A$AP')).toBe('live love asap')
    expect(normalizeLibrarySearchText('ASAP Rocky')).toBe('asap rocky')
  })
})

describe('matchesLibrarySearch', () => {
  it('matches live in Live.Love.A$AP', () => {
    expect(matchesLibrarySearch('live', 'Live.Love.A$AP', 'A$AP Rocky')).toBe(true)
  })

  it('matches ASAP against A$AP', () => {
    expect(matchesLibrarySearch('asap', 'Live.Love.A$AP', 'A$AP Rocky')).toBe(true)
    expect(matchesLibrarySearch('asap rocky', 'Live.Love.A$AP', 'A$AP Rocky')).toBe(true)
  })

  it('still requires a real substring after normalize', () => {
    expect(matchesLibrarySearch('blur', 'Live.Love.A$AP', 'A$AP Rocky')).toBe(false)
  })
})
