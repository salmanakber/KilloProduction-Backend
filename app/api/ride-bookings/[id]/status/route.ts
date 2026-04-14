import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { runRideCompletionSideEffects } from "@/lib/ride-post-completion"

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: rideBookingId } = params
    const { status } = await request.json()

    // Verify user has permission to update this booking
    // Only riders who have submitted bids should be able to update status to BIDDING
    if (status === "BIDDING") {
      const bid = await prisma.rideBid.findFirst({
        where: {
          rideBookingId,
          riderId: user.id,
          status: "PENDING",
        },
      })

      if (!bid) {
        return NextResponse.json({ 
          error: "You can only update status to BIDDING if you have submitted a bid" 
        }, { status: 403 })
      }
    }

    // Check if ride booking exists
    const rideBooking = await prisma.rideBooking.findUnique({
      where: { id: rideBookingId },
    })

    if (!rideBooking) {
      return NextResponse.json({ error: "Ride booking not found" }, { status: 404 })
    }

    // Update the status
    const updatedBooking = await prisma.rideBooking.update({
      where: { id: rideBookingId },
      data: { 
        status,
        updatedAt: new Date()
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        rider: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        rideBids: {
          include: {
            rider: true
          }
        }
      }
    })

    // Send WebSocket notification to all riders who have bids on this booking
    if (updatedBooking.rideBids && updatedBooking.rideBids.length > 0) {
      const bidUpdateMessage = {
        type: 'booking_status_update',
        payload: {
          bookingId: updatedBooking.id,
          bookingType: 'ride',
          status: updatedBooking.status,
          bookingNumber: updatedBooking.bookingNumber,
          isBookedByAnother: status === 'RIDER_ASSIGNED' || status === 'ACCEPTED',
          assignedRiderId: updatedBooking.riderId
        }
      }

      // Send to all riders who have bids on this booking
      for (const bid of updatedBooking.rideBids) {
        if (bid.rider) {
          await socketIOServer.sendNotificationToUser(bid.rider.id, bidUpdateMessage.payload)
        }
      }
    }

    // Send notification to customer about status update
    if (updatedBooking.customer) {
      try {
        // If ride is completed, send rating request notification
        if (status === 'COMPLETED') {
          await NotificationBridge.sendNotification({
            userId: updatedBooking.customer.id,
            title: 'Rate Your Ride',
            message: `Your trip is complete. Please rate your rider to help us improve.`,
            type: 'REVIEW_REQUEST',
            module: 'RIDING',
            actionUrl: `/riding/bookings/${rideBookingId}/rate`,
            data: {
              actionType: 'navigate',
              screen: 'RiderFeedbackScreen',
              params: {
                name: 'bookingId',  
                value: rideBookingId, 
              }
            }
          })

          // Also send WebSocket notification for real-time update
          try {
            await socketIOServer.sendNotificationToUser(updatedBooking.customer.id, {
              type: 'review_request',
              bookingId: rideBookingId,
              bookingType: 'ride',
              bookingNumber: updatedBooking.bookingNumber,
              actionType: 'navigate',
              screen: 'RiderFeedbackScreen',
              params: {
                name: 'bookingId',  
                value: rideBookingId, 
              },
              timestamp: new Date().toISOString()
            })
          } catch (wsError) {
            console.error('Failed to send WebSocket rating notification:', wsError)
          }
        } else {
          // Regular status updates
          const statusMessages: {[key: string]: {title: string, message: string}} = {
            'EN_ROUTE_TO_PICKUP': {
              title: 'Rider On The Way',
              message: `Your rider is on the way to pickup location for booking #${updatedBooking.bookingNumber}`
            },
            'ARRIVED_AT_PICKUP': {
              title: 'Rider Arrived',
              message: `Your rider has arrived at the pickup location for booking #${updatedBooking.bookingNumber}`
            },
            'PICKED_UP': {
              title: 'Trip Started',
              message: `Your trip has started for booking #${updatedBooking.bookingNumber}`
            },
            'EN_ROUTE_TO_DROPOFF': {
              title: 'On The Way',
              message: `Your trip is on the way to your destination for booking #${updatedBooking.bookingNumber}`
            },
            'ARRIVED_AT_DROPOFF': {
              title: 'Rider Arrived',
              message: `Your rider has arrived at your destination for booking #${updatedBooking.bookingNumber}`
            }
          }

          const statusMessage = statusMessages[status] || {
            title: 'Status Updated',
            message: `Your booking #${updatedBooking.bookingNumber} status has been updated to ${status}`
          }

          await NotificationBridge.sendNotification({
            userId: updatedBooking.customer.id,
            title: statusMessage.title,
            message: statusMessage.message,
            type: 'ORDER_UPDATE',
            module: 'RIDING',
            actionUrl: `/riding/bookings/${rideBookingId}`,
            data: {
              actionType: 'navigate',
              screen: 'RideBookingScreen',
              params: {
                name: 'bookingId',
                value: rideBookingId,
              }
           
            }
          })
        }
      } catch (notifyError) {
        console.error('Failed to send status notification to customer:', notifyError)
      }
    }

    // Send notification to rider if assigned
    if (updatedBooking.rider && status !== 'REQUESTED' && status !== 'BIDDING') {
      try {
        const riderStatusMessages: {[key: string]: {title: string, message: string}} = {
          'EN_ROUTE_TO_PICKUP': {
            title: 'Status Updated',
            message: `You are en route to pickup for booking #${updatedBooking.bookingNumber}`
          },
          'ARRIVED_AT_PICKUP': {
            title: 'Arrived at Pickup',
            message: `You have arrived at pickup location for booking #${updatedBooking.bookingNumber}`
          },
          'PICKED_UP': {
            title: 'Trip Started',
            message: `Trip started successfully for booking #${updatedBooking.bookingNumber}`
          },
          'EN_ROUTE_TO_DROPOFF': {
            title: 'En Route to Destination',
            message: `You are en route to destination for booking #${updatedBooking.bookingNumber}`
          },
          'ARRIVED_AT_DROPOFF': {
            title: 'Arrived at Destination',
            message: `You have arrived at destination for booking #${updatedBooking.bookingNumber}`
          },
          'COMPLETED': {
            title: 'Trip Completed',
            message: `Trip completed successfully for booking #${updatedBooking.bookingNumber}`
          }
        }

        const riderMessage = riderStatusMessages[status] || {
          title: 'Status Updated',
          message: `Booking #${updatedBooking.bookingNumber} status updated to ${status}`
        }

        await NotificationBridge.sendNotification({
          userId: updatedBooking.rider.id,
          title: riderMessage.title,
          message: riderMessage.message,
          type: 'ORDER_UPDATE',
          module: 'RIDING',
          actionUrl: `/rider/booking/${rideBookingId}`,
          data: {
            bookingId: rideBookingId,
            status: status,
            bookingType: 'ride'
          }
        })
      } catch (notifyError) {
        console.error('Failed to send status notification to rider:', notifyError)
      }
    }

    if (updatedBooking.status === "COMPLETED" && updatedBooking.riderId) {
      try {
        await runRideCompletionSideEffects(rideBookingId)
      } catch (e) {
        console.error("Ride completion side effects:", e)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Status updated successfully",
      data: {
        id: updatedBooking.id,
        status: updatedBooking.status,
        updatedAt: updatedBooking.updatedAt,
      }
    })

  } catch (error) {
    console.error("Error updating ride booking status:", error)
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 })
  }
}
