import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { bidId } = await request.json()

    // Get the bid with related data
    const bid = await prisma.rideBid.findUnique({
      where: { id: bidId },
      include: {
        rideBooking: {
          include: {
            customer: true,
          },
        },
        rider: {
          include: {
            riderProfile: true,
          },
        },
      },
    })

    if (!bid) {
      return NextResponse.json({ error: "Bid not found" }, { status: 404 })
    }

    // Verify customer owns the ride booking
    if (bid.rideBooking.customerId !== session.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    // Check if bid is still valid
    if (bid.status !== "PENDING" || new Date() > bid.expiresAt) {
      return NextResponse.json({ error: "Bid is no longer valid" }, { status: 400 })
    }

    // Update the ride booking with accepted rider and fare
    const updatedRideBooking = await prisma.rideBooking.update({
      where: { id: bid.rideBookingId },
      data: {
        riderId: bid.riderId,
        finalFare: bid.bidAmount,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
      include: {
        rider: {
          select: {
            name: true,
            phone: true,
            riderProfile: {
              select: {
                vehicleType: true,
                vehicleBrand: true,
                vehicleModel: true,
                vehicleColor: true,
                licensePlate: true,
                rating: true,
              },
            },
          },
        },
      },
    })

    // Accept the winning bid and reject all others
    await prisma.rideBid.updateMany({
      where: { rideBookingId: bid.rideBookingId },
      data: { status: "REJECTED" },
    })

    await prisma.rideBid.update({
      where: { id: bidId },
      data: { status: "ACCEPTED" },
    })

    // Create initial tracking entry
    await prisma.rideTracking.create({
      data: {
        rideBookingId: bid.rideBookingId,
        latitude: bid.rideBooking.pickupLatitude,
        longitude: bid.rideBooking.pickupLongitude,
        status: "ACCEPTED",
        notes: "Rider assigned and heading to pickup location",
      },
    })

    // Notify rider that their bid was accepted
    await sendBidAcceptedNotification(bid.riderId, updatedRideBooking)

    // Notify other riders that the ride was taken
    const rejectedBids = await prisma.rideBid.findMany({
      where: {
        rideBookingId: bid.rideBookingId,
        status: "REJECTED",
        riderId: { not: bid.riderId },
      },
    })

    for (const rejectedBid of rejectedBids) {
      await sendBidRejectedNotification(rejectedBid.riderId)
    }

    return NextResponse.json({
      rideBooking: updatedRideBooking,
      message: "Bid accepted successfully",
    })
  } catch (error) {
    console.error("Error accepting bid:", error)
    return NextResponse.json({ error: "Failed to accept bid" }, { status: 500 })
  }
}

async function sendBidAcceptedNotification(riderId: string, rideBooking: any) {
  // TODO: Implement push notification
  console.log(`Sending bid accepted notification to rider ${riderId}`)
}

async function sendBidRejectedNotification(riderId: string) {
  // TODO: Implement push notification
  console.log(`Sending bid rejected notification to rider ${riderId}`)
}
