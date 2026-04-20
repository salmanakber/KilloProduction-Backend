/** Stable 2dp money for JSON/API (avoids 89.04999999999998). */
export function roundMoney2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}
