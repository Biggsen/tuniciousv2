export function normalizeForLastfm(value: string): string {
  return value
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u2032/g, "'")
    .trim()
}

export function scrobbleThresholdMs(trackLengthMs: number | undefined): number {
  if (!trackLengthMs || trackLengthMs <= 0) return 240_000
  return Math.min(Math.floor(trackLengthMs / 2), 240_000)
}

export function meetsScrobbleThreshold(
  listenedMs: number,
  trackLengthMs: number | undefined,
): boolean {
  return listenedMs >= scrobbleThresholdMs(trackLengthMs)
}
