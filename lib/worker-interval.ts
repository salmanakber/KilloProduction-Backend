/**
 * Periodic worker tick with overlap protection.
 * Unlike raw setInterval, a new tick is skipped while the previous run is still in progress.
 */
export function createGuardedInterval(
  label: string,
  fn: () => Promise<unknown>,
  ms: number,
  runImmediately = true
): NodeJS.Timeout {
  let busy = false

  const run = async () => {
    if (busy) {
      console.warn(`[${label}] tick skipped — previous run still in progress`)
      return
    }
    busy = true
    try {
      await fn()
    } catch (e) {
      console.error(`[${label}]`, e)
    } finally {
      busy = false
    }
  }

  if (runImmediately) {
    void run()
  }

  return setInterval(() => {
    void run()
  }, ms)
}
