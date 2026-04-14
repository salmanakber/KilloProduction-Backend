import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"


export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: courierBookingId } = params
    const { bidAmount, estimatedTime, message } = await request.json()

    // Verify rider is eligible
    const rider = await prisma.user.findUnique({
      where: { id: user.id },
      include: { riderProfile: true },
    })

    if (!rider || rider.role !== "RIDER" || !rider.riderProfile?.isApproved) {
      return NextResponse.json({ error: "Not authorized to bid" }, { status: 403 })
    }

    // Check if courier booking exists and is still available
    const courierBooking = await prisma.courierBooking.findUnique({
      where: { id: courierBookingId },
    })

    if (!courierBooking || (courierBooking.status !== "REQUESTED" && courierBooking.status !== "BIDDING")) {
      return NextResponse.json({ error: "Courier request is no longer available" }, { status: 400 })
    }

    // Check if rider already has an active bid
    const existingBid = await prisma.courierBid.findFirst({
      where: {
        courierBookingId,
        riderId: user.id,
        status: "PENDING",
      },
    })

   

    if (existingBid) {
      return NextResponse.json({ error: "You already have an active bid for this courier request" }, { status: 400 })
    }

    // Create the bid with 1 minute expiry
    const bid = await prisma.courierBid.create({
      data: {
        courierBookingId,
        riderId: user.id,
        bidAmount,
        estimatedTime,
        message,
        expiresAt: new Date(Date.now() + 60 * 1000), // 1 minute expiry
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
                totalDeliveries: true,
              },
            },
          },
        },
      },
    })

    // Update courier booking status to BIDDING
    await prisma.courierBooking.update({
      where: { id: courierBookingId },
      data: { status: "BIDDING" },
    })

    

    await NotificationBridge.sendNotification({
      userId: courierBooking.customerId,
      title: 'New Bid Received',
      message: `A new price offer has been submitted for your courier request`,
      type: 'BID_RECEIVED',
      module: 'COURIER',
      actionUrl: `CustomerRiding`,
      data: {
        bookingId: courierBookingId,
        bidId: bid.id,
        bidAmount: bid.bidAmount,
        estimatedTime: bid.estimatedTime,
        message: bid.message,
        rider: bid.rider,
        requestType: 'courier'
      }
    })

    // Notify customer about the new bid via WebSocket
    await socketIOServer.sendNotificationToUser(courierBooking.customerId, {
      type: 'bid_received',
      bookingId: courierBookingId,
      bidId: bid.id,
      bidAmount: bid.bidAmount,
      estimatedTime: bid.estimatedTime,
      message: bid.message,
      rider: bid.rider,
      requestType: 'courier'
    })

    // Notify all riders about the status change
    await socketIOServer.sendNotificationToRole('RIDER', {
      type: 'request_status_change',
      requestId: courierBookingId,
      requestType: 'courier',
      newStatus: 'BIDDING',
      bookingNumber: courierBooking.bookingNumber
    })

    return NextResponse.json({
      success: true,
      bid,
      message: "Courier bid submitted successfully",
    })
  } catch (error) {
    console.error("Error creating courier bid:", error)
    return NextResponse.json({ error: "Failed to submit courier bid" }, { status: 500 })
  }
}

async function sendBidNotificationToCustomer(customerId: string, bid: any) {
  // TODO: Implement push notification to customer
  console.log(`Sending courier bid notification to customer ${customerId}`)
}
