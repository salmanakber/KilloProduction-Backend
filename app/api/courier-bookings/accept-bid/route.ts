import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { createWalletTransaction } from "@/lib/wallet-transaction-service"
import { tryCalculateCommissionAmount } from "@/lib/commission-service"
import { CommissionType } from "@prisma/client"

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
      return NextResponse.json({ error: "Not authorized to accept this bid" }, { status: 403 })
    }

    // Check if booking is already assigned
    if (bid.courierBooking.riderId) {
    //   return NextResponse.json({ error: "Booking is already assigned to a rider" }, { status: 400 })
    }

    // Check if bid is still valid
    if (bid.status !== "PENDING") {
      return NextResponse.json({ error: "Bid is no longer pending" }, { status: 400 })
    }

    if (new Date() > bid.expiresAt) {
      return NextResponse.json({ error: "Bid has expired" }, { status: 400 })
    }

    // Update the courier booking with accepted rider and fare
    const updatedCourierBooking = await prisma.courierBooking.update({
      where: { id: bid.courierBookingId },
      data: {
        riderId: bid.riderId,
        fare: bid.bidAmount,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
      include: {
        rider: {
          select: {
            id: true,
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
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    })

    // Pharmacy → wholesaler courier: rider is now known — pending CREDIT for net delivery fare (completed on trip completion).
    try {
      const moduleRow = await prisma.courierBooking.findUnique({
        where: { id: bid.courierBookingId },
        select: { module: true },
      })
      const isWholesalerCourier =
        String(moduleRow?.module || "").toUpperCase() === "WHOLESALER"
      if (isWholesalerCourier && bid.riderId) {
        const supplierOrder = await prisma.supplierOrder.findFirst({
          where: { courierBookingId: bid.courierBookingId },
          select: { id: true },
        })
        if (supplierOrder) {
          const deliveryFee = updatedCourierBooking.fare ?? bid.bidAmount ?? 0
          const riderCut = await tryCalculateCommissionAmount(
            "WHOLESALER",
            deliveryFee,
            CommissionType.RIDER_COMMISSION,
          )
          const riderNetFare = Math.max(0, deliveryFee - riderCut)
          if (riderNetFare > 0) {
            const ref = `courier:${bid.courierBookingId}:delivery`
            const existing = await prisma.walletTransaction.findFirst({
              where: { userId: bid.riderId, reference: ref },
            })
            if (!existing) {
              await createWalletTransaction({
                userId: bid.riderId,
                type: "CREDIT",
                amount: riderNetFare,
                description: `Pending delivery payment for booking ${bid.courierBookingId}`,
                status: "PENDING",
                reference: ref,
                metadata: {
                  courierBookingId: bid.courierBookingId,
                  transactionType: "DELIVERY_PAYMENT",
                  supplierOrderId: supplierOrder.id,
                },
              })
            }
          }
        }
      }
    } catch (walletErr) {
      console.error("accept-bid rider wholesale wallet:", walletErr)
    }

    // Accept the winning bid and reject all others
    await prisma.courierBid.updateMany({
      where: { courierBookingId: bid.courierBookingId },
      data: { status: "REJECTED" },
    })

    await prisma.courierBid.update({
      where: { id: bidId },
      data: { status: "ACCEPTED" },
    })

    // Update rider availability
    await prisma.riderProfile.update({
      where: { userId: bid.riderId },
      data: {
        isAvailable: false,
        updatedAt: new Date(),
      },
    })

    // Get all bids to notify riders
    const allBids = await prisma.courierBid.findMany({
      where: { courierBookingId: bid.courierBookingId },
      include: {
        rider: true,
      },
    })

    // Notify the winning rider that their bid was accepted - send bid_accepted event for navigation
    try {
      // Send bid_accepted event to trigger navigation to RiderLiveMapScreen
      await socketIOServer.sendNotificationToUser(bid.riderId, {
        type: 'bid_accepted',
        event: 'bid_accepted',
        bidId: bid.id,
        bookingId: updatedCourierBooking.id,
        courierBookingId: updatedCourierBooking.id,
        bookingType: 'courier',
        bookingNumber: updatedCourierBooking.bookingNumber,
        status: 'ACCEPTED',
        bidStatus: 'ACCEPTED',
        message: 'Your bid has been accepted!',
        riderId: bid.riderId,
        customerId: updatedCourierBooking.customerId,
        customerName: updatedCourierBooking.customer.name,
        customerPhone: updatedCourierBooking.customer.phone,
        pickupAddress: updatedCourierBooking.pickupAddress,
        dropAddress: updatedCourierBooking.dropAddress,
        pickupLatitude: updatedCourierBooking.pickupLatitude,
        pickupLongitude: updatedCourierBooking.pickupLongitude,
        dropLatitude: updatedCourierBooking.dropLatitude,
        dropLongitude: updatedCourierBooking.dropLongitude,
        distance: updatedCourierBooking.distance,
        estimatedTime: updatedCourierBooking.estimatedTime,
        finalFare: updatedCourierBooking.fare,
        bidAmount: bid.bidAmount,
        booking: {
          id: updatedCourierBooking.id,
          type: 'courier',
          bookingNumber: updatedCourierBooking.bookingNumber,
          status: 'ACCEPTED',
          pickupAddress: updatedCourierBooking.pickupAddress,
          dropAddress: updatedCourierBooking.dropAddress,
          pickupLatitude: updatedCourierBooking.pickupLatitude,
          pickupLongitude: updatedCourierBooking.pickupLongitude,
          dropLatitude: updatedCourierBooking.dropLatitude,
          dropLongitude: updatedCourierBooking.dropLongitude,
          distance: updatedCourierBooking.distance,
          estimatedFare: updatedCourierBooking.fare,
          finalFare: updatedCourierBooking.fare,
          fare: updatedCourierBooking.fare,
          estimatedTime: updatedCourierBooking.estimatedTime,
          customer: updatedCourierBooking.customer,
        },
      })
    } catch (socketError) {
      console.error("Error sending socket notification to winning rider:", socketError)
      // Don't fail the request if socket notification fails
    }

    // Notify other riders that their bids were rejected
    for (const rejectedBid of allBids) {
      if (rejectedBid.id !== bidId && rejectedBid.rider) {
        try {
          await socketIOServer.sendNotificationToUser(rejectedBid.rider.id, {
            type: 'bid_status_change',
            event: 'bid_status_change',
            payload: {
              bidId: rejectedBid.id,
              bookingId: bid.courierBookingId,
              bookingType: 'courier',
              bookingNumber: bid.courierBooking.bookingNumber,
              status: 'REJECTED',
              bidStatus: 'REJECTED',
              message: 'This booking has been assigned to another rider',
              isBookedByAnother: true,
              assignedRiderId: bid.riderId,
            },
          })
        } catch (socketError) {
          console.error(`Error sending socket notification to rider ${rejectedBid.rider.id}:`, socketError)
          // Continue with other notifications
        }
      }
    }

    // Create a notification for the winning rider
    await prisma.notification.create({
      data: {
        userId: bid.riderId,
        title: "Bid Accepted!",
        message: `Your bid for courier booking #${bid.courierBooking.bookingNumber} has been accepted.`,
        type: "BID_ACCEPTED" as any,
        data: {
          bookingId: bid.courierBookingId,
          bidId: bid.id,
          bidAmount: bid.bidAmount,
        },
        createdAt: new Date(),
      },
    })

    // Send notification using NotificationBridge
    try {
      await NotificationBridge.sendNotification({
        userId: bid.riderId,
        title: "Bid Accepted!",
        message: `Your bid for courier booking #${bid.courierBooking.bookingNumber} has been accepted. The booking is now assigned to you.`,
        type: "BID_ACCEPTED",
        module: "COURIER",
        actionUrl: `/rider/booking/${bid.courierBookingId}`,
        data: {
          bookingId: bid.courierBookingId,
          bidId: bid.id,
          bidAmount: bid.bidAmount,
          bookingType: 'courier'
        }
      })
    } catch (notifyError) {
      console.error('Failed to send bid acceptance notification:', notifyError)
    }

    // Send notification to customer
    try {
      await NotificationBridge.sendNotification({
        userId: updatedCourierBooking.customerId,
        title: "Rider Assigned",
        message: `A rider has been assigned to your courier booking #${bid.courierBooking.bookingNumber}. You can now track your delivery.`,
        type: "ORDER_UPDATE",
        module: "COURIER",
        actionUrl: `/courier-bookings/${bid.courierBookingId}`,
        data: {
          bookingId: bid.courierBookingId,
          riderId: bid.riderId,
          status: 'ACCEPTED',
          bookingType: 'courier'
        }
      })
    } catch (notifyError) {
      console.error('Failed to send customer notification:', notifyError)
    }

    return NextResponse.json({
      success: true,
      message: "Bid accepted successfully",
      booking: updatedCourierBooking,
      bid: {
        id: bid.id,
        status: "ACCEPTED",
        bidAmount: bid.bidAmount,
      },
    })
  } catch (error) {
    console.error("Error accepting courier bid:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to accept bid",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}

