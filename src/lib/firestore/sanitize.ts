/** Firestore rejects `undefined` field values — strip them before writes. */
export function omitUndefined<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}
