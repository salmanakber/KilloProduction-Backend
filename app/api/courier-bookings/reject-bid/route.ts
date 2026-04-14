import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { bidId } = await request.json()

    if (!bidId) {
      return NextResponse.json({ error: "Bid ID is required" }, { status: 400 })
    }

    // Get the bid with related data
    const bid = await prisma.courierBid.findUnique({
      where: { id: bidId },
      include: {
        courierBooking: {
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

    // Verify customer owns the courier booking
    if (bid.courierBooking.customerId !== user.id) {
      return NextResponse.json({ error: "Not authorized to reject this bid" }, { status: 403 })
    }

    // Check if bid is still valid
    if (bid.status !== "PENDING") {
      return NextResponse.json({ error: "Bid is no longer pending" }, { status: 400 })
    }

    // Update the bid status to rejected
    const updatedBid = await prisma.courierBid.update({
      where: { id: bidId },
      data: { 
        status: "REJECTED",
      },
    })

    // Notify the rider that their bid was rejected
    try {
      await socketIOServer.sendNotificationToUser(bid.riderId, {
        type: 'bid_status_change',
        event: 'bid_status_change',
        payload: {
          bidId: bid.id,
          bookingId: bid.courierBookingId,
          bookingType: 'courier',
          bookingNumber: bid.courierBooking.bookingNumber,
          status: 'REJECTED',
          bidStatus: 'REJECTED',
          message: 'Your bid has been rejected by the customer',
        },
      })
    } catch (socketError) {
      console.error("Error sending socket notification:", socketError)
      // Don't fail the request if socket notification fails
    }

    // Create a notification for the rider
    await prisma.notification.create({
      data: {
        userId: bid.riderId,
        title: "Bid Rejected",
        message: `Your bid for courier booking #${bid.courierBooking.bookingNumber} has been rejected.`,
        type: "BID_REJECTED" as any,
        data: {
          bookingId: bid.courierBookingId,
          bidId: bid.id,
          bidAmount: bid.bidAmount,
        },
        createdAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: "Bid rejected successfully",
      bid: {
        id: updatedBid.id,
        status: updatedBid.status,
      },
    })
  } catch (error) {
    console.error("Error rejecting courier bid:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to reject bid",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}

