import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { finalizeCourierDropoffDelivery } from "@/lib/finalize-courier-dropoff-delivery"

/**
 * Customer confirms delivery after the rider has marked ARRIVED_AT_DROPOFF.
 * Same side effects as the rider scanning the delivery QR (wallets, rider payout, order DELIVERED).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { bookingId } = params
    const booking = await prisma.courierBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, customerId: true },
    })

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    if (booking.customerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    const result = await finalizeCourierDropoffDelivery(bookingId)
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Could not confirm delivery" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      alreadyCompleted: result.alreadyCompleted,
      message: result.alreadyCompleted
        ? "Delivery was already confirmed"
        : "Delivery confirmed. Thank you!",
    })
  } catch (e: any) {
    console.error("confirm-delivery", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
