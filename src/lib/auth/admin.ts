/** Comma-separated Firebase UIDs allowed to archive albums and use admin tools. */
function adminUids(): Set<string> {
  const raw = import.meta.env.VITE_ADMIN_UIDS ?? ''
  return new Set(
    raw
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean),
  )
}

export function isAdminUid(uid: string | null | undefined): boolean {
  if (!uid) return false
  return adminUids().has(uid)
}
