import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { applyPropertyPaymentSuccess } from "@/lib/property-booking-service"
import { roundMoney2 } from "@/lib/money-round"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { paymentData, paymentMethod } = await request.json()
    const booking = await prisma.propertyBooking.findUnique({ where: { id: params.id } })
    if (!booking || booking.customerId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (booking.status !== "PENDING_PAYMENT") {
      return NextResponse.json({ error: "Booking is not awaiting payment" }, { status: 400 })
    }

    if (paymentData) {
      const processingFee = Math.max(0, Number(paymentData.paymentProcessingFee || 0))
      const expected = roundMoney2(booking.totalAmount + processingFee)
      if (
        paymentData.amount != null &&
        Math.abs(Number(paymentData.amount) - expected) > 0.02
      ) {
        return NextResponse.json({ error: "Payment amount mismatch" }, { status: 400 })
      }
      if (paymentData.status !== "succeeded" && paymentData.status !== "PAID") {
        return NextResponse.json({ error: "Payment not successful" }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: "paymentData is required" }, { status: 400 })
    }

    const result = await applyPropertyPaymentSuccess({
      bookingId: booking.id,
      paymentData,
      paymentMethod,
    })

    const updated = await prisma.propertyBooking.findUnique({ where: { id: params.id } })
    return NextResponse.json({ success: true, booking: updated, ...result })
  } catch (error: any) {
    console.error("Property booking pay error:", error)
    return NextResponse.json(
      { error: error?.message || "Payment failed" },
      { status: 500 }
    )
  }
}
