import { type NextRequest, NextResponse } from "next/server"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { isValidInternalBearerAuth } from "@/lib/internal-bearer-auth"

export async function POST(request: NextRequest) {
  try {
    if (!isValidInternalBearerAuth(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const customerId = body?.customerId as string | undefined
    const hostUserId = body?.hostUserId as string | undefined
    const vendorId = body?.vendorId as string | undefined
    const payload = body?.payload

    if (!customerId || !hostUserId || !vendorId || !payload?.bookingId) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const io = getGlobalSocketServer()
    io.emitEventToUser(customerId, "property_booking_updated", payload)
    io.emitEventToUser(hostUserId, "property_booking_checked_in", payload)
    if (vendorId !== hostUserId) {
      io.emitEventToUser(vendorId, "property_booking_checked_in", payload)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("property-booking-socket-broadcast:", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
