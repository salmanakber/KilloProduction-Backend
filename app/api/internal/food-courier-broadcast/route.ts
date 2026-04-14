import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { isValidInternalBearerAuth } from "@/lib/internal-bearer-auth"

/**
 * Called by the food rider dispatch worker to emit the same payload customers send via `new_request`.
 * Auth: Bearer CRON_SECRET or Bearer FOOD_DISPATCH_INTERNAL_SECRET (same pattern as /api/cron/*).
 */
export async function POST(request: NextRequest) {
  try {
    if (!isValidInternalBearerAuth(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const courierBookingId = body?.courierBookingId as string | undefined
    if (!courierBookingId) {
      return NextResponse.json({ error: "courierBookingId required" }, { status: 400 })
    }

    const booking = await prisma.courierBooking.findUnique({
      where: { id: courierBookingId },
    })

    if (!booking || booking.module !== "FOOD" || booking.status !== "REQUESTED") {
      return NextResponse.json({ success: false, skipped: true }, { status: 200 })
    }

    const payload = {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      type: "courier",
      module: "FOOD",
      pickupLatitude: booking.pickupLatitude,
      pickupLongitude: booking.pickupLongitude,
      dropLatitude: booking.dropLatitude,
      dropLongitude: booking.dropLongitude,
      estimatedFare: booking.fare,
      distance: booking.distance,
      estimatedTime: booking.estimatedTime,
      pickupAddress: booking.pickupAddress,
      dropAddress: booking.dropAddress,
      customerId: booking.customerId,
      createdAt: booking.createdAt,
    }

    await getGlobalSocketServer().broadcastCourierNewRequestToRiders(payload)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("food-courier-broadcast:", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
