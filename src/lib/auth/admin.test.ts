import { afterEach, describe, expect, it, vi } from 'vitest'

import { isAdminUid } from '@/lib/auth/admin'

describe('isAdminUid', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns false when uid is missing', () => {
    expect(isAdminUid(null)).toBe(false)
    expect(isAdminUid(undefined)).toBe(false)
    expect(isAdminUid('')).toBe(false)
  })

  it('matches configured admin uids', () => {
    vi.stubEnv('VITE_ADMIN_UIDS', ' admin-1,admin-2 ')
    expect(isAdminUid('admin-1')).toBe(true)
    expect(isAdminUid('admin-2')).toBe(true)
    expect(isAdminUid('admin-3')).toBe(false)
  })
})
