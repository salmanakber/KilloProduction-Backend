import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: bookingId } = params

    // Verify rider is eligible
    const rider = await prisma.user.findUnique({
      where: { id: user.id },
      include: { riderProfile: true },
    })

    if (!rider || rider.role !== "RIDER" || !rider.riderProfile?.isApproved) {
      return NextResponse.json({ error: "Not authorized to expire bids" }, { status: 403 })
    }

    // Check if this is a ride booking or courier booking
    const rideBooking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        customerId: true,
        bookingNumber: true,
        status: true,
      }
    })

    const courierBooking = await prisma.courierBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        customerId: true,
        bookingNumber: true,
        status: true,
      }
    })

    const booking = rideBooking || courierBooking
    const bookingType = rideBooking ? 'ride' : 'courier'

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    // Find the rider's active bid for this booking
    let bid = null
    let customerId = booking.customerId

    if (bookingType === 'ride') {
      bid = await prisma.rideBid.findFirst({
        where: {
          rideBookingId: bookingId,
          riderId: user.id,
          status: 'PENDING',
        },
        include: {
          rider: {
            select: {
              name: true,
              riderProfile: {
                select: {
                  vehicleType: true,
                  licensePlate: true,
                  rating: true,
                }
              },
            },
          },
        },
      })

      if (!bid) {
        return NextResponse.json({ error: "No active bid found for this booking" }, { status: 404 })
      }

      // Update bid status to EXPIRED
      await prisma.rideBid.update({
        where: { id: bid.id },
        data: { status: 'EXPIRED' }
      })

      // Check if there are any other pending bids for this booking
      const remainingPendingBids = await prisma.rideBid.count({
        where: {
          rideBookingId: bookingId,
          status: 'PENDING',
        }
      })

      // If no more pending bids, update booking status back to REQUESTED
      if (remainingPendingBids === 0) {
        await prisma.rideBooking.update({
          where: { id: bookingId },
          data: { status: 'REQUESTED' }
        })
      }

    } else {
      bid = await prisma.courierBid.findFirst({
        where: {
          courierBookingId: bookingId,
          riderId: user.id,
          status: 'PENDING',
        },
        include: {
          rider: {
            select: {
              name: true,
              riderProfile: {
                select: {
                  vehicleType: true,
                  licensePlate: true,
                  rating: true,
                }
              },
            },
          },
        },
      })

      if (!bid) {
        return NextResponse.json({ error: "No active bid found for this booking" }, { status: 404 })
      }

      // Update bid status to EXPIRED
      await prisma.courierBid.update({
        where: { id: bid.id },
        data: { status: 'EXPIRED' }
      })

      // Check if there are any other pending bids for this booking
      const remainingPendingBids = await prisma.courierBid.count({
        where: {
          courierBookingId: bookingId,
          status: 'PENDING',
        }
      })

      // If no more pending bids, update booking status back to REQUESTED
      if (remainingPendingBids === 0) {
        await prisma.courierBooking.update({
          where: { id: bookingId },
          data: { status: 'REQUESTED' }
        })
      }
    }

    // Notify customer about the expired bid via WebSocket
    console.log(`📤 Expiring bid ${bid.id} for booking ${bookingId}, notifying customer ${customerId}`)
    await socketIOServer.sendNotificationToUser(customerId, {
      type: 'bid_expired',
      bookingId: bookingId,
      bidId: bid.id,
      bookingType: bookingType,
      bookingNumber: booking.bookingNumber,
      riderId: user.id,
      riderName: bid.rider.name,
    })
    console.log(`✅ Bid expired notification sent to customer ${customerId}`)

    return NextResponse.json({
      success: true,
      message: "Bid expired successfully",
      bid: {
        id: bid.id,
        status: 'EXPIRED',
      }
    })
  } catch (error) {
    console.error("Error expiring bid:", error)
    return NextResponse.json({ error: "Failed to expire bid" }, { status: 500 })
  }
}

