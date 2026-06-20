/**
 * In-memory rebroadcast wave tracking (per booking).
 * Expands rider search radius and cap on each repost.
 */

const rebroadcastCountByBooking = new Map<string, number>()
const notifiedRiderUserIdsByBooking = new Map<string, Set<string>>()

export function getRebroadcastCount(bookingId: string): number {
  return rebroadcastCountByBooking.get(bookingId) || 0
}

/** Call when customer taps repost / broadcast again. */
export function incrementRebroadcastCount(bookingId: string): number {
  const next = getRebroadcastCount(bookingId) + 1
  rebroadcastCountByBooking.set(bookingId, next)
  return next
}

/** Progressive expansion: 1st repost → 15km / 20 riders, 2nd → 20km / 30, etc. */
export function getRebroadcastWaveParams(waveNumber: number) {
  const radiusKm = Math.min(10 + waveNumber * 5, 40)
  const maxRiders = Math.min(10 + waveNumber * 10, 50)
  const waveSize = 5
  return { radiusKm, maxRiders, waveSize }
}

export function getNotifiedRiderUserIds(bookingId: string): Set<string> {
  if (!notifiedRiderUserIdsByBooking.has(bookingId)) {
    notifiedRiderUserIdsByBooking.set(bookingId, new Set())
  }
  return notifiedRiderUserIdsByBooking.get(bookingId)!
}

export function recordNotifiedRiderUserIds(bookingId: string, riderUserIds: string[]) {
  const set = getNotifiedRiderUserIds(bookingId)
  for (const id of riderUserIds) {
    if (id) set.add(id)
  }
}

export function clearRebroadcastState(bookingId: string) {
  rebroadcastCountByBooking.delete(bookingId)
  notifiedRiderUserIdsByBooking.delete(bookingId)
}
