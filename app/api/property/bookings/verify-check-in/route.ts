import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getPropertyHostContext, parsePropertyCheckInQr } from "@/lib/property-host-resolve"
import { performPropertyCheckIn } from "@/lib/property-check-in"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ctx = await getPropertyHostContext(user.id)
    if (!ctx?.canManageBookings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { code, qrCode } = await request.json()
    const parsed = parsePropertyCheckInQr(String(qrCode || code || ""))
    if (!parsed) {
      return NextResponse.json({ error: "Invalid check-in code" }, { status: 400 })
    }

    const booking = await prisma.propertyBooking.findFirst({
      where: {
        vendorId: ctx.hostVendorId,
        OR: [{ id: parsed }, { bookingNumber: parsed }],
      },
      select: { id: true },
    })

    if (!booking) {
      return NextResponse.json({ error: "Booking not found for this host" }, { status: 404 })
    }

    const result = await performPropertyCheckIn({
      bookingId: booking.id,
      hostUserId: user.id,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error("verify-check-in:", error)
    return NextResponse.json({ error: error?.message || "Check-in failed" }, { status: 500 })
  }
}
