import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import {
  computeBidExpiresAt,
  expirePendingRideBidsForBooking,
  rideBookingRequestEndsAtMs,
} from "@/lib/riding-bid-expiry"

const DEFAULT_BID_CAP_PERCENT = 20

function getBidCapPercent(): number {
  const raw = Number(process.env.RIDING_BID_CAP_PERCENT ?? DEFAULT_BID_CAP_PERCENT)
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_BID_CAP_PERCENT
  return raw
}

function calculateMaxBidCapAmount(estimatedFare: number): number {
  const capPercent = getBidCapPercent()
  const capped = estimatedFare * (1 + capPercent / 100)
  return Math.round(capped * 100) / 100
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: rideBookingId } = params
    const { bidAmount, estimatedTime, message } = await request.json()

    // Verify rider is eligible
    const rider = await prisma.user.findUnique({
      where: { id: user.id },
      include: { riderProfile: true },
    })

    if (!rider || rider.role !== "RIDER" || !rider.riderProfile?.isApproved) {
      return NextResponse.json({ error: "Not authorized to bid" }, { status: 403 })
    }

    // Check if ride booking exists and is still available (other riders may bid after first bid moves to BIDDING)
    const rideBooking = await prisma.rideBooking.findUnique({
      where: { id: rideBookingId },
    })

    if (!rideBooking || !["REQUESTED", "BIDDING"].includes(rideBooking.status)) {
      return NextResponse.json({ error: "Ride request is no longer available" }, { status: 400 })
    }

    await expirePendingRideBidsForBooking(rideBookingId)

    const requestEndsAtMs = rideBookingRequestEndsAtMs(rideBooking)
    if (Date.now() >= requestEndsAtMs) {
      return NextResponse.json({ error: "Request bidding window has ended" }, { status: 400 })
    }
    const normalizedBidAmount = Number(bidAmount)
    if (!Number.isFinite(normalizedBidAmount) || normalizedBidAmount <= 0) {
      return NextResponse.json({ error: "Invalid bid amount" }, { status: 400 })
    }
    const maxBidCapAmount = calculateMaxBidCapAmount(Number(rideBooking.estimatedFare || 0))
    if (normalizedBidAmount > maxBidCapAmount) {
      return NextResponse.json({
        error: `Bid cannot exceed max cap (${maxBidCapAmount.toFixed(2)})`,
        maxBidCapAmount,
      }, { status: 400 })
    }

    // Check if rider already has an active bid
    const existingBid = await prisma.rideBid.findFirst({
      where: {
        rideBookingId,
        riderId: user.id,
        status: "PENDING",
      },
    })

    if (existingBid) {
      return NextResponse.json({ error: "You already have an active bid for this ride" }, { status: 400 })
    }

    const bidExpiresAt = computeBidExpiresAt(requestEndsAtMs)
    if (bidExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Request bidding window has ended" }, { status: 400 })
    }

    const bid = await prisma.rideBid.create({
      data: {
        rideBookingId,
        riderId: user.id,
        bidAmount: normalizedBidAmount,
        estimatedTime,
        message,
        expiresAt: bidExpiresAt,
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

    if (rideBooking.status === "REQUESTED") {
      await prisma.rideBooking.update({
        where: { id: rideBookingId },
        data: { status: "BIDDING" },
      })
    }

    await NotificationBridge.sendNotification({
      userId: rideBooking.customerId,
      title: 'New Bid Received',
      message: `A new price offer has been submitted for your ride request`,
      type: 'BID_RECEIVED',
      module: 'RIDING',
      actionUrl: `CustomerRiding`,
      data: {
        bookingId: rideBookingId,
        bidId: bid.id,
        bidAmount: bid.bidAmount,
        estimatedTime: bid.estimatedTime,
        message: bid.message,
        rider: bid.rider,
        requestType: 'ride'
      } 
    })
 
    // Notify customer about the new bid via WebSocket
    await socketIOServer.sendNotificationToUser(rideBooking.customerId, {
      type: 'bid_received',
      bookingId: rideBookingId,
      bidId: bid.id,
      bidAmount: bid.bidAmount,
      estimatedTime: bid.estimatedTime,
      message: bid.message,
      rider: bid.rider,
      requestType: 'ride'
    })

    // Notify all riders about the status change
    await socketIOServer.sendNotificationToRole('RIDER', {
      type: 'request_status_change',
      requestId: rideBookingId,
      requestType: 'ride',
      newStatus: 'BIDDING',
      bookingNumber: rideBooking.bookingNumber
    })

    return NextResponse.json({
      success: true,
      bid,
      message: "Ride bid submitted successfully",
    })
  } catch (error) {
    console.error("Error creating ride bid:", error)
    return NextResponse.json({ error: "Failed to submit ride bid" }, { status: 500 })
  }
}

async function sendBidNotificationToCustomer(customerId: string, bid: any) {
  // TODO: Implement push notification to customer
  console.log(`Sending ride bid notification to customer ${customerId}`)
}

