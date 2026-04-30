import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { issueRideStartOtp, verifyRideStartOtp } from "@/lib/ride-start-otp"

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await authenticateRequest(_request)
    if (!session?.id || session.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rideBooking = await prisma.rideBooking.findUnique({
      where: { id: params.id },
      select: { id: true, customerId: true, status: true },
    })
    let bookingType: "RIDE_BOOKING" | "COURIER_BOOKING" = "RIDE_BOOKING"
    let bookingId = rideBooking?.id || ""
    let bookingStatus = rideBooking?.status || ""

    if (!rideBooking || rideBooking.customerId !== session.id) {
      const courierBooking = await prisma.courierBooking.findUnique({
        where: { id: params.id },
        select: { id: true, customerId: true, status: true, module: true },
      })
      if (!courierBooking || courierBooking.customerId !== session.id) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 })
      }
      if (String(courierBooking.module || "").toUpperCase() !== "RIDE") {
        return NextResponse.json({ error: "OTP is not enabled for this courier module" }, { status: 400 })
      }
      bookingType = "COURIER_BOOKING"
      bookingId = courierBooking.id
      bookingStatus = courierBooking.status
    }
    if (!["ARRIVED_AT_PICKUP", "EN_ROUTE_TO_PICKUP", "ACCEPTED", "RIDER_ASSIGNED"].includes(bookingStatus)) {
      return NextResponse.json({ error: "OTP is not available for this ride state" }, { status: 400 })
    }

   
    const issued = issueRideStartOtp(`${bookingType}:${bookingId}`)
    return NextResponse.json({
      success: true,
      data: issued,
      otp: issued.otp,
      expiresAt: issued.expiresAt,
      bookingType,
    })
  } catch (error) {
    console.error("ride-start-otp GET error:", error)
    return NextResponse.json({ error: "Failed to issue OTP" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const otp = String(body?.otp || "").trim()
    if (!otp || otp.length !== 6) {
      return NextResponse.json({ error: "Invalid OTP format" }, { status: 400 })
    }

    const rideBooking = await prisma.rideBooking.findUnique({
      where: { id: params.id },
      select: { id: true, riderId: true, status: true },
    })
    let bookingType: "RIDE_BOOKING" | "COURIER_BOOKING" = "RIDE_BOOKING"
    let bookingId = rideBooking?.id || ""
    let bookingStatus = rideBooking?.status || ""

    if (!rideBooking || rideBooking.riderId !== session.id) {
      const courierBooking = await prisma.courierBooking.findUnique({
        where: { id: params.id },
        select: { id: true, riderId: true, status: true, module: true },
      })
      if (!courierBooking || courierBooking.riderId !== session.id) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 })
      }
      if (String(courierBooking.module || "").toUpperCase() !== "RIDE") {
        return NextResponse.json({ error: "OTP is not enabled for this courier module" }, { status: 400 })
      }
      bookingType = "COURIER_BOOKING"
      bookingId = courierBooking.id
      bookingStatus = courierBooking.status
    }
    if (bookingStatus !== "ARRIVED_AT_PICKUP") {
      return NextResponse.json({ error: "OTP can only be verified at pickup" }, { status: 400 })
    }

    const valid = await verifyRideStartOtp(`${bookingType}:${bookingId}`, otp)
    if (!valid) {
      return NextResponse.json({ success: false, error: "OTP is invalid or expired" }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("ride-start-otp POST error:", error)
    return NextResponse.json({ error: "Failed to verify OTP" }, { status: 500 })
  }
}
