import { getGlobalSocketServer } from "@/lib/socket-server"
import { getInternalServiceBearerToken } from "@/lib/internal-bearer-auth"

export type PropertyBookingSocketPayload = {
  bookingId: string
  status?: string
  checkedIn?: boolean
  escrowReleased?: boolean
  guestName?: string
  listingTitle?: string
  rescheduled?: boolean
  checkIn?: string
  checkOut?: string
}

function emitDirect(userId: string, event: string, payload: PropertyBookingSocketPayload) {
  getGlobalSocketServer().emitEventToUser(userId, event, payload)
}

/** Emit property booking socket events; HTTP fallback when API process has no live sockets. */
export async function emitPropertyBookingSocketEvents(params: {
  customerId: string
  hostUserId: string
  vendorId: string
  payload: PropertyBookingSocketPayload
}) {
  const { customerId, hostUserId, vendorId, payload } = params
  const io = getGlobalSocketServer()
  const stats = io.getStats()

  if (stats.authenticatedConnections > 0) {
    emitDirect(customerId, "property_booking_updated", payload)
    emitDirect(hostUserId, "property_booking_checked_in", payload)
    if (vendorId !== hostUserId) {
      emitDirect(vendorId, "property_booking_checked_in", payload)
    }
    return
  }

  const token = getInternalServiceBearerToken()
  const base = (
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://127.0.0.1:3000"
  )
    .replace(/\/api\/?$/, "")
    .replace(/\/$/, "")

  if (!token) {
    emitDirect(customerId, "property_booking_updated", payload)
    emitDirect(hostUserId, "property_booking_checked_in", payload)
    if (vendorId !== hostUserId) {
      emitDirect(vendorId, "property_booking_checked_in", payload)
    }
    return
  }

  try {
    await fetch(`${base}/api/internal/property-booking-socket-broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerId,
        hostUserId,
        vendorId,
        payload,
      }),
    })
  } catch (e) {
    console.warn("[property-socket-emit] HTTP fallback failed", e)
    emitDirect(customerId, "property_booking_updated", payload)
    emitDirect(hostUserId, "property_booking_checked_in", payload)
    if (vendorId !== hostUserId) {
      emitDirect(vendorId, "property_booking_checked_in", payload)
    }
  }
}
