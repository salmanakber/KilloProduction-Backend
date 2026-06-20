/**
 * Tracks which riders are currently viewing a ride request (socket presence).
 */

export type RequestViewer = {
  riderUserId: string
  riderName: string
  avatar?: string | null
  lastSeenAt: number
}

const viewersByBooking = new Map<string, Map<string, RequestViewer>>()
const VIEWER_TTL_MS = 45_000

function pruneStale(bookingId: string) {
  const map = viewersByBooking.get(bookingId)
  if (!map) return
  const now = Date.now()
  for (const [id, v] of map) {
    if (now - v.lastSeenAt > VIEWER_TTL_MS) map.delete(id)
  }
  if (map.size === 0) viewersByBooking.delete(bookingId)
}

export function upsertRequestViewer(
  bookingId: string,
  viewer: Omit<RequestViewer, "lastSeenAt">
): RequestViewer[] {
  if (!bookingId || !viewer.riderUserId) return []
  if (!viewersByBooking.has(bookingId)) {
    viewersByBooking.set(bookingId, new Map())
  }
  const map = viewersByBooking.get(bookingId)!
  map.set(viewer.riderUserId, { ...viewer, lastSeenAt: Date.now() })
  pruneStale(bookingId)
  return listRequestViewers(bookingId)
}

export function removeRequestViewer(bookingId: string, riderUserId: string): RequestViewer[] {
  const map = viewersByBooking.get(bookingId)
  if (map) {
    map.delete(riderUserId)
    if (map.size === 0) viewersByBooking.delete(bookingId)
  }
  return listRequestViewers(bookingId)
}

export function listRequestViewers(bookingId: string): RequestViewer[] {
  pruneStale(bookingId)
  const map = viewersByBooking.get(bookingId)
  if (!map) return []
  return Array.from(map.values()).sort((a, b) => a.riderName.localeCompare(b.riderName))
}
