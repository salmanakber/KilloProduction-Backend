import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { rideBookingId, bidAmount, estimatedTime, message } = await request.json()

    // Verify rider is eligible
    const rider = await prisma.user.findUnique({
      where: { id: session.id },
      include: { riderProfile: true },
    })

    if (!rider || rider.role !== "RIDER" || !rider.riderProfile?.isApproved) {
      return NextResponse.json({ error: "Not authorized to bid" }, { status: 403 })
    }

    // Check if ride booking exists and is still available
    const rideBooking = await prisma.rideBooking.findUnique({
      where: { id: rideBookingId },
    })

    if (!rideBooking || rideBooking.status !== "REQUESTED") {
      return NextResponse.json({ error: "Ride request is no longer available" }, { status: 400 })
    }

    // Check if rider already has an active bid
    const existingBid = await prisma.rideBid.findFirst({
      where: {
        rideBookingId,
        riderId: session.id,
        status: "PENDING",
      },
    })

    if (existingBid) {
      return NextResponse.json({ error: "You already have an active bid for this ride" }, { status: 400 })
    }

    // Create the bid
    const bid = await prisma.rideBid.create({
      data: {
        rideBookingId,
        riderId: session.id,
        bidAmount,
        estimatedTime,
        message,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
      },
      include: {
        rider: {
          select: {
            name: true,
            riderProfile: {
              select: {
                vehicleType: true,
                vehicleBrand: true,
                vehicleModel: true,
                licensePlate: true,
                rating: true,
                totalRides: true,
              },
            },
          },
        },
      },
    })

    // Update ride booking status to BIDDING if it's the first bid
    await prisma.rideBooking.update({
      where: { id: rideBookingId },
      data: { status: "BIDDING" },
    })

    // Notify customer about the new bid
    await sendBidNotificationToCustomer(rideBooking.customerId, bid)

    return NextResponse.json({
      bid,
      message: "Bid submitted successfully",
    })
  } catch (error) {
    console.error("Error creating bid:", error)
    return NextResponse.json({ error: "Failed to submit bid" }, { status: 500 })
  }
}

async function sendBidNotificationToCustomer(customerId: string, bid: any) {
  // TODO: Implement push notification to customer
  console.log(`Sending bid notification to customer ${customerId}`)
}
