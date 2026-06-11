import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { propertyCheckInQrValue } from "@/lib/property-host-resolve"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const booking = await prisma.propertyBooking.findUnique({
      where: { id: params.id },
      select: { id: true, bookingNumber: true, customerId: true, vendorId: true, status: true },
    })
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (booking.customerId !== user.id && booking.vendorId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      qrCode: propertyCheckInQrValue(booking.id),
      bookingNumber: booking.bookingNumber,
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to load QR" }, { status: 500 })
  }
}
