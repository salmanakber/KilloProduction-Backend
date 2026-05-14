import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { runRideCompletionSideEffects } from "@/lib/ride-post-completion"
import { verifyRideStartOtp } from "@/lib/ride-start-otp"
import {
  buildRideLifecycleTimestampPatch,
  buildRidePickupWaitingPatchOnPickUp,
  getPickupWaitingArrivalResetPatch,
  roundMoney2,
} from "@/lib/pickup-waiting"

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
    const { status, rideStartOtp } = await request.json()

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

    if (status === "PICKED_UP" && rideBooking.status === "ARRIVED_AT_PICKUP") {
      const otp = String(rideStartOtp || "").trim()
          if (!otp || !(await verifyRideStartOtp(`RIDE_BOOKING:${rideBookingId}`, otp))) {
        return NextResponse.json(
          { error: "That code doesn't match the customer's trip OTP. Ask them to read the 6-digit code from their trip screen." },
          { status: 400 }
        )
      }
    }

    const now = new Date()
    const lifecycle = buildRideLifecycleTimestampPatch({
      nextStatus: status,
      now,
      existing: {
        acceptedAt: rideBooking.acceptedAt,
        arrivedAt: rideBooking.arrivedAt,
        pickedUpAt: rideBooking.pickedUpAt,
        completedAt: rideBooking.completedAt,
        cancelledAt: rideBooking.cancelledAt,
      },
    })

    let pickupWaitingData: {
      pickupWaitingFee?: number | null
      pickupWaitingMinutesBillable?: number | null
      finalFare?: number
    } = {}

    if (status === "PICKED_UP" && rideBooking.pickupWaitingFee == null) {
      const pickedUpAt = lifecycle.pickedUpAt ?? rideBooking.pickedUpAt ?? now
      const arrivedEffective = rideBooking.arrivedAt ?? lifecycle.arrivedAt ?? null
      const w = await buildRidePickupWaitingPatchOnPickUp({
        rideBookingId,
        pickedUpAt,
        arrivedAt: arrivedEffective,
        existingPickupWaitingFee: rideBooking.pickupWaitingFee ?? null,
      })
      if (w.pickupWaitingFee != null && w.pickupWaitingMinutesBillable != null) {
        const baseFare = Number(rideBooking.finalFare ?? rideBooking.estimatedFare ?? 0)
        pickupWaitingData = {
          pickupWaitingFee: w.pickupWaitingFee,
          pickupWaitingMinutesBillable: w.pickupWaitingMinutesBillable,
          ...(w.finalFareDelta !== 0 ? { finalFare: roundMoney2(baseFare + w.finalFareDelta) } : {}),
        }
      }
    }

    // Update the status
    const updatedBooking = await prisma.rideBooking.update({
      where: { id: rideBookingId },
      data: { 
        status,
        updatedAt: now,
        ...lifecycle,
        ...pickupWaitingData,
        ...(status === "ARRIVED_AT_PICKUP" ? getPickupWaitingArrivalResetPatch() : {}),
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

    // Socket.IO event name = payload.type — must include type so clients receive "booking_status_update"
    // (otherwise the server falls back to emitting "notification" and RiderLiveMap never hears completion).
    const rideBookingStatusPayload = {
      type: "booking_status_update" as const,
      bookingId: updatedBooking.id,
      bookingType: "ride" as const,
      status: updatedBooking.status,
      bookingNumber: updatedBooking.bookingNumber,
      isBookedByAnother: status === "RIDER_ASSIGNED" || status === "ACCEPTED",
      assignedRiderId: updatedBooking.riderId,
      riderId: updatedBooking.riderId,
      timestamp: new Date().toISOString(),
    }
    const rideRiderIds = new Set<string>()
    for (const bid of updatedBooking.rideBids || []) {
      if (bid.rider?.id) rideRiderIds.add(bid.rider.id)
    }
    if (updatedBooking.riderId) rideRiderIds.add(updatedBooking.riderId)
    for (const rid of rideRiderIds) {
      try {
        await socketIOServer.sendNotificationToUser(rid, rideBookingStatusPayload)
      } catch (e) {
        console.error("ride booking_status_update socket:", e)
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

          if (updatedBooking.riderId) {
            try {
              await NotificationBridge.sendNotification({
                userId: updatedBooking.riderId,
                title: "Rate your passenger",
                message: `Trip #${updatedBooking.bookingNumber} is complete. Please rate your customer.`,
                type: "REVIEW_REQUEST",
                module: "RIDER",
                actionUrl: `/riderfeedback?bookingId=${rideBookingId}&perspective=rider`,
                data: {
                  actionType: "navigate",
                  screen: "riderfeedback",
                  bookingId: rideBookingId,
                  perspective: "rider",
                  params: [
                    { name: "bookingId", value: rideBookingId },
                    { name: "perspective", value: "rider" },
                  ],
                },
              })
              await socketIOServer.sendNotificationToUser(updatedBooking.riderId, {
                type: "review_request",
                bookingId: rideBookingId,
                bookingType: "ride",
                bookingNumber: updatedBooking.bookingNumber,
                module: "RIDING",
                actionType: "navigate",
                screen: "riderfeedback",
                perspective: "rider",
                params: [
                  { name: "bookingId", value: rideBookingId },
                  { name: "perspective", value: "rider" },
                ],
                timestamp: new Date().toISOString(),
              })
            } catch (riderReviewErr) {
              console.error("Rider rating prompt (ride):", riderReviewErr)
            }
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
