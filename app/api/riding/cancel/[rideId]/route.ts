import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"

export async function POST(
  request: NextRequest,
  { params }: { params: { rideId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { rideId } = params
    const { reason } = await request.json()

    if (!rideId) {
      return NextResponse.json({ error: "Ride ID is required" }, { status: 400 })
    }

    // Check both tables
    const rideBooking = await prisma.rideBooking.findFirst({
      where: {
        id: rideId,
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        rider: { select: { id: true, name: true, email: true } },
      },
    })

    const courierBooking = !rideBooking
      ? await prisma.courierBooking.findFirst({
          where: {
            id: rideId,
            status: { notIn: ['CANCELLED', 'COMPLETED'] },
          },
          include: {
            customer: { select: { id: true, name: true, email: true } },
            rider: { select: { id: true, name: true, email: true } },
          },
        })
      : null

    const booking = rideBooking || courierBooking
    const isRideBooking = !!rideBooking

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    if (booking.customerId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    if (['COMPLETED', 'CANCELLED'].includes(booking.status)) {
      return NextResponse.json({
        error: `Booking is already ${booking.status.toLowerCase()}`,
      }, { status: 400 })
    }

    // Update cancellation
    const updatedBooking = isRideBooking
      ? await prisma.rideBooking.update({
          where: { id: rideId },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
          include: {
            customer: { select: { id: true, name: true } },
            rideType: { select: { id: true, name: true, category: true } },
          },
        })
      : await prisma.courierBooking.update({
          where: { id: rideId },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
          include: { customer: { select: { id: true, name: true } } },
        })

    // Notifications via Socket
    const socketServer = getGlobalSocketServer()
    if (socketServer) {
      // Broadcast request_update to all riders to remove the cancelled booking
      await socketServer.sendNotificationToRole('RIDER', {
        type: 'request_update',
        bookingId: rideId,
        status: 'CANCELLED',
        requestType: isRideBooking ? 'ride' : 'courier',
        bookingNumber: booking.bookingNumber,
        message: 'Booking cancelled by customer',
      })
      
      // Notify customer via socket
      await socketServer.sendNotificationToUser(user.id, {
        type: 'request_update',
        bookingId: rideId,
        status: 'CANCELLED',
        requestType: isRideBooking ? 'ride' : 'courier',
        bookingNumber: booking.bookingNumber,
        message: 'Your booking has been cancelled',
      })
      
      // Notify rider if assigned
      if (booking.riderId) {
        await socketServer.sendNotificationToUser(booking.riderId, {
          type: 'request_update',
          bookingId: rideId,
          status: 'CANCELLED',
          requestType: isRideBooking ? 'ride' : 'courier',
          bookingNumber: booking.bookingNumber,
          message: 'Booking cancelled by customer',
        })
        
        // Also send push notification
        try {
          await NotificationBridge.sendNotification({
            userId: booking.riderId,
            title: 'Booking Cancelled',
            message: `A booking has been cancelled by the customer`,
            type: 'booking_cancelled',
            module: 'RIDING',
            data: {
              bookingId: rideId,
              bookingNumber: booking.bookingNumber,
              message: 'Booking cancelled by customer',
            },
            actionUrl: `CustomerRiding`,
          })
        } catch (error) {
          console.error('Error sending push notification:', error)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Booking cancelled successfully",
      data: { booking: updatedBooking },
    })
  } catch (error) {
    console.error("Error cancelling booking:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to cancel booking",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
