const MIN_INTERVAL_MS = 1000

let lastRequestAt = 0
let chain: Promise<void> = Promise.resolve()

export function enqueueMusicBrainzRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const now = Date.now()
    const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestAt))
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
    lastRequestAt = Date.now()
    return task()
  })

  chain = run.then(
    () => undefined,
    () => undefined,
  )

  return run
}
