import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { computeRiderPickupEta } from "@/lib/riding-bid-pickup-eta"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const bookingId = String(body?.bookingId || "")
    const bidIds = Array.isArray(body?.bidIds)
      ? body.bidIds.map((id: unknown) => String(id)).filter(Boolean)
      : []

    if (!bookingId) {
      return NextResponse.json({ success: false, error: "Booking ID is required" }, { status: 400 })
    }

    const rideBooking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        customerId: true,
        pickupLatitude: true,
        pickupLongitude: true,
      },
    })

    const courierBooking = rideBooking
      ? null
      : await prisma.courierBooking.findUnique({
          where: { id: bookingId },
          select: {
            id: true,
            customerId: true,
            pickupLatitude: true,
            pickupLongitude: true,
          },
        })

    const booking = rideBooking || courierBooking
    if (!booking) {
      return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 })
    }

    if (booking.customerId !== user.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const pickupLat = Number(booking.pickupLatitude)
    const pickupLng = Number(booking.pickupLongitude)
    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
      return NextResponse.json({ success: false, error: "Pickup location unavailable" }, { status: 400 })
    }

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || null
    const etas: Record<string, { pickupEtaMinutes: number | null; pickupDistanceKm: number | null }> = {}

    if (rideBooking) {
      const rideBids = await prisma.rideBid.findMany({
        where: {
          rideBookingId: bookingId,
          status: "PENDING",
          ...(bidIds.length ? { id: { in: bidIds } } : {}),
        },
        include: {
          rider: {
            select: {
              riderProfile: {
                select: { currentLocation: true },
              },
            },
          },
        },
      })

      await Promise.all(
        rideBids.map(async (bid) => {
          etas[bid.id] = await computeRiderPickupEta({
            riderLocation: bid.rider?.riderProfile?.currentLocation,
            pickupLat,
            pickupLng,
            googleApiKey,
          })
        }),
      )
    } else {
      const courierBids = await prisma.courierBid.findMany({
        where: {
          courierBookingId: bookingId,
          status: "PENDING",
          ...(bidIds.length ? { id: { in: bidIds } } : {}),
        },
        include: {
          rider: {
            select: {
              riderProfile: {
                select: { currentLocation: true },
              },
            },
          },
        },
      })

      await Promise.all(
        courierBids.map(async (bid) => {
          etas[bid.id] = await computeRiderPickupEta({
            riderLocation: bid.rider?.riderProfile?.currentLocation,
            pickupLat,
            pickupLng,
            googleApiKey,
          })
        }),
      )
    }

    return NextResponse.json({ success: true, data: { etas } })
  } catch (error) {
    console.error("Error computing bid pickup ETAs:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
