/**
 * Food-only prep time helpers: sublinear scaling per extra unit, then combine lines per kitchen.
 */

export function preparationMinutesForLineItem(baseMinutes: number, quantity: number): number {
  const base = Math.max(1, Math.round(baseMinutes || 15))
  if (quantity <= 0) return 0
  const extra = Math.max(0, quantity - 1)
  const incrementPerExtra = Math.max(2, Math.min(10, Math.round(base * 0.35)))
  return base + extra * incrementPerExtra
}

/** Multiple SKUs at one restaurant: longest line dominates; additional lines add partial overlap. */
export function combineRestaurantPrepLines(lineMinutes: number[]): number {
  if (lineMinutes.length === 0) return 15
  const sorted = [...lineMinutes].sort((a, b) => b - a)
  let total = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    total += sorted[i] * 0.35
  }
  return Math.max(15, Math.ceil(total))
}

/** Delay from order creation until ~30% prep remains → fire at 70% of first-stop prep minutes. */
export function foodRiderDispatchDelayMs(firstPickupPrepMinutes: number): number {
  const m = Math.max(1, Math.round(firstPickupPrepMinutes * 0.7))
  return m * 60 * 1000
}
