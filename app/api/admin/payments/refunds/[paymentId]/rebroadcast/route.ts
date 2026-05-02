import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/adminAuth"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"

export async function POST(_request: Request, { params }: { params: { paymentId: string } }) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: { id: true, metadata: true },
    })
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 })
    }

    const metadata =
      payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
        ? (payment.metadata as Record<string, any>)
        : {}
    const refund = metadata.refund && typeof metadata.refund === "object" ? (metadata.refund as Record<string, any>) : {}
    const bookingId = String(refund.refundCourierBookingId || "")
    if (!bookingId) {
      return NextResponse.json({ error: "Refund pickup booking not found for this refund" }, { status: 400 })
    }

    const booking = await prisma.courierBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        riderId: true,
        bookingNumber: true,
        pickupAddress: true,
        dropAddress: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropLatitude: true,
        dropLongitude: true,
        totalFee: true,
        customerId: true,
      },
    })
    if (!booking) {
      return NextResponse.json({ error: "Refund pickup booking does not exist" }, { status: 404 })
    }
    if (booking.riderId) {
      return NextResponse.json({ error: "Rider already assigned. Rebroadcast not required." }, { status: 409 })
    }

    const io = getGlobalSocketServer()
    if (!io) {
      return NextResponse.json({ error: "Realtime server unavailable" }, { status: 503 })
    }

    await io.broadcastToRole("RIDER", {
      type: "new_request",
      rebroadcast: true,
      requestType: "courier",
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      pickupAddress: booking.pickupAddress,
      dropAddress: booking.dropAddress,
      pickupLatitude: booking.pickupLatitude,
      pickupLongitude: booking.pickupLongitude,
      dropLatitude: booking.dropLatitude,
      dropLongitude: booking.dropLongitude,
      estimatedFare: booking.totalFee,
      customerId: booking.customerId,
      module: "REFUND",
      createdAt: new Date().toISOString(),
      metadata: {
        refundPaymentId: payment.id,
        otpMode: "REFUND",
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("refund rebroadcast POST:", error)
    return NextResponse.json({ error: "Failed to rebroadcast refund pickup" }, { status: 500 })
  }
}
