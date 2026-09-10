import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadV1ImportSelection,
  saveV1ImportSelection,
} from '@/lib/import/persistV1Selection'

function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  })
  return store
}

describe('persistV1Selection', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  it('round-trips group and stage id', () => {
    saveV1ImportSelection('uid-1', { group: 'known', stageId: 'stage-abc' })
    expect(loadV1ImportSelection('uid-1')).toEqual({
      group: 'known',
      stageId: 'stage-abc',
    })
  })

  it('is scoped per user', () => {
    saveV1ImportSelection('uid-a', { group: 'new', stageId: 'queued' })
    saveV1ImportSelection('uid-b', { group: 'known', stageId: 'curious' })
    expect(loadV1ImportSelection('uid-a')?.stageId).toBe('queued')
    expect(loadV1ImportSelection('uid-b')?.stageId).toBe('curious')
  })

  it('returns null for corrupt or incomplete payloads', () => {
    localStorage.setItem('tunicious.import.v1Selection.uid-1', '{')
    expect(loadV1ImportSelection('uid-1')).toBeNull()

    localStorage.setItem(
      'tunicious.import.v1Selection.uid-1',
      JSON.stringify({ group: 'maybe', stageId: 'x' }),
    )
    expect(loadV1ImportSelection('uid-1')).toBeNull()
  })

  it('swallows storage failures on save', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined,
      clear: () => undefined,
    })
    expect(() =>
      saveV1ImportSelection('uid-1', { group: 'new', stageId: 'queued' }),
    ).not.toThrow()
  })
})
