import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { sendEmailFromTemplate } from "@/lib/email"
import { runCourierCompletionSideEffects } from "@/lib/courier-post-completion"

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: courierBookingId } = params
    const { status } = await request.json()

    // Verify user has permission to update this booking
    // Only riders who have submitted bids should be able to update status to BIDDING
    if (status === "BIDDING") {
      const bid = await prisma.courierBid.findFirst({
        where: {
          courierBookingId,
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

    // Check if courier booking exists
    const courierBooking = await prisma.courierBooking.findUnique({
      where: { id: courierBookingId },
      include: {
        supplierOrders: {
          include: {
            wholesaler: {
              select: {
                userId: true,
                id: true,
              }
            },
            pharmacy: {
              select: {
                userId: true,
                id: true,
              }
            }
          }
        }
      }
    })

    if (!courierBooking) {
      return NextResponse.json({ error: "Courier booking not found" }, { status: 404 })
    }

    // Update the status
    const updatedBooking = await prisma.courierBooking.update({
      where: { id: courierBookingId },
      data: { 
        status,
        updatedAt: new Date(),
    
        supplierOrders: {
          updateMany: {
            where: {
              courierBookingId: courierBookingId,
            },
            data: {
              ...(status === 'COMPLETED' && { status: 'DELIVERED' }),
            },
          },
        },
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
        bids: {
          include: {
            rider: true
          }
        },
        // optional if needed
        supplierOrders: true
      }
    });


    
    // Handle regular Order (if orderId exists)
    let updatedOrder: any = null
    if (updatedBooking.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: updatedBooking.orderId },
        select: { partRequestId: true },
      });
      
      const deliveredAt =
        updatedBooking.status === "COMPLETED" ? new Date() : undefined

      updatedOrder = await prisma.order.update({
        where: { id: updatedBooking.orderId },
        data: {
          status:
            updatedBooking.status === 'COMPLETED'
              ? 'DELIVERED'
              : 'PENDING',
      
          paymentStatus:
            updatedBooking.status === 'COMPLETED'
              ? 'PAID'
              : 'PENDING',

          ...(deliveredAt && { deliveredAt }),
      
          ...(order?.partRequestId && {
            partRequest: {
              update: {
                status:
                  updatedBooking.status === 'COMPLETED'
                    ? 'COMPLETED'
                    : undefined,
              },
            },
          }),
        },
        select: {
          id: true,
          module: true,
          vendorId: true,
          total: true,
          platformCommission: true,
          deliveryFee: true,
          isChildOrder: true,
          childId: true,
        },
      });

      if (updatedBooking.status === "COMPLETED" && deliveredAt) {
        await prisma.order.updateMany({
          where: {
            childId: updatedBooking.orderId,
            isChildOrder: true,
          },
          data: {
            status: "DELIVERED",
            paymentStatus: "PAID",
            deliveredAt,
          },
        })
      }
    }

    // Process commissions and wallet transactions when order is completed
    if (updatedBooking.status === 'COMPLETED' && updatedBooking.riderId) {
      try {
        await runCourierCompletionSideEffects(courierBookingId)
      } catch (commissionError) {
        console.error('Error processing commissions on order completion:', commissionError)
      }
    }

    // Create order tracking entry for courier status update (only if orderId exists)
    if (updatedBooking.status && updatedBooking.orderId) {
      try {
        await prisma.orderTracking.create({
          data: {
            orderId: updatedBooking.orderId,
            status: updatedBooking.status === 'COMPLETED' ? 'DELIVERED' : (updatedBooking.status as any),
            notes: `Courier booking status updated to ${updatedBooking.status}`,
            timestamp: new Date(),
          },
        })
      } catch (error) {
        console.error("Error creating order tracking:", error)
      }
    }
    
    
    let orderType: string = '';
    if (updatedOrder?.partRequest) {
      orderType = 'AUTO_PARTS';
    }
    else{
      orderType = 'COURIER';
    }
    

    // Send WebSocket notification to all riders who have bids on this booking
    if (updatedBooking.bids && updatedBooking.bids.length > 0) {
      const bidUpdateMessage = {
        type: 'booking_status_update',
        payload: {
          bookingId: updatedBooking.id,
          bookingType: 'courier',
          status: updatedBooking.status,
          bookingNumber: updatedBooking.bookingNumber,
          isBookedByAnother: status === 'RIDER_ASSIGNED' || status === 'ACCEPTED',
          assignedRiderId: updatedBooking.riderId
        }
      }

      // Send to all riders who have bids on this booking
      for (const bid of updatedBooking.bids) {
        if (bid.rider) {
          await socketIOServer.sendNotificationToUser(bid.rider.id, bidUpdateMessage.payload)
        }
      }
    }

    // Send notification to customer about status update
    if (updatedBooking.customer) {
      try {
        // If delivery is completed, send rating request notification
        if (status === 'DELIVERED' || status === 'COMPLETED') {
          await NotificationBridge.sendNotification({
            userId: updatedBooking.customer.id,
            title: 'Rate Your Delivery',
            message: 'Your delivery is complete. Please rate your rider to help us improve.',
            type: 'REVIEW_REQUEST',
            module: 'COURIER',
            actionUrl: `/courier-bookings/${courierBookingId}/rate`,
            data: {
              actionType: 'navigate',
              screen: 'riderfeedback',
              params: [
                {
                  name: 'bookingId',
                  value: courierBookingId,
                },
                {
                  name: 'serviceType',
                  value: updatedOrder?.module?.toLowerCase(),
                },
              ],
            },
          })
          

          // Also send WebSocket notification for real-time update
          try {
            await socketIOServer.sendNotificationToUser(updatedBooking.customer.id, {
              type: 'review_request',
              bookingId: courierBookingId,
              bookingType: 'courier',
              bookingNumber: updatedBooking.bookingNumber,
              actionType: 'navigate',
              screen: 'riderfeedback',
              params: {
                name: 'bookingId',
                value: courierBookingId,
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
              title: 'Package Picked Up',
              message: `Your package has been picked up and is on the way for booking #${updatedBooking.bookingNumber}`
            },
            'EN_ROUTE_TO_DROPOFF': {
              title: 'On The Way',
              message: `Your delivery is on the way to you for booking #${updatedBooking.bookingNumber}`
            },
            'ARRIVED_AT_DROPOFF': {
              title: 'Rider Arrived',
              message: `Your rider has arrived at the dropoff location for booking #${updatedBooking.bookingNumber}`
            }
          }

          const statusMessage = statusMessages[status] || {
            title: 'Status Updated',
            message: `Your booking #${updatedBooking.bookingNumber} status has been updated to ${status}`
          }

          let notificationRouteObj: any = undefined;

          if (orderType === 'AUTO_PARTS') {
            notificationRouteObj = {
              actionType: 'navigate',
              screen: 'PartRequestOffers',
              params: [
                {
                name: 'requestId',
                value: updatedOrder?.partRequest?.id,
                },
                {
                name: 'request',
                value: updatedOrder?.partRequest,
                },
              ]
            }
            
          } else {
            notificationRouteObj = {
              actionType: 'navigate',
              screen: 'CourierBookingScreen',
              params: {
                name: 'bookingId',
                value: courierBookingId,
              }
            }
          }

          await NotificationBridge.sendNotification({
            userId: updatedBooking.customer.id,
            title: statusMessage.title,
            message: statusMessage.message,
            type: 'ORDER_UPDATE',
            module: 'COURIER',
            actionUrl: `/courier-bookings/${courierBookingId}`,
            data: {
              ...notificationRouteObj,
              
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
            title: 'Package Picked Up',
            message: `Package picked up successfully for booking #${updatedBooking.bookingNumber}`
          },
          'EN_ROUTE_TO_DROPOFF': {
            title: 'En Route to Dropoff',
            message: `You are en route to dropoff location for booking #${updatedBooking.bookingNumber}`
          },
          'ARRIVED_AT_DROPOFF': {
            title: 'Arrived at Dropoff',
            message: `You have arrived at dropoff location for booking #${updatedBooking.bookingNumber}`
          },
          'DELIVERED': {
            title: 'Delivery Completed',
            message: `Delivery completed successfully for booking #${updatedBooking.bookingNumber}`
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
          module: 'COURIER',
          actionUrl: `/rider/live-map/${courierBookingId}`,
          data: {
            actionType: 'navigate',
            screen: 'RiderLiveMapScreen',
            params: {
              name: 'booking',
              value: courierBookingId,
            }
          }
        })
      } catch (notifyError) {
        console.error('Failed to send status notification to rider:', notifyError)
      }
    }

    const rideType = await prisma.rideType.findUnique({
      where: { id: updatedBooking.rideTypeId },
    })

    // Send email to customer about status update
    if (updatedBooking.customer.email) {
      await sendEmailFromTemplate(updatedBooking.customer.email!, 'RIDE_FEEDBACK_REQUEST', {
      customerName: updatedBooking.customer.name,
      riderName: updatedBooking.rider?.name,
      rideType: rideType?.name || '',
      rideId: updatedBooking.id,
      feedbackUrl: `${process.env.APP_URL}/ride-feedback/${updatedBooking.id}`,
      appName: process.env.APP_NAME || 'Killo',
    })
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
    console.error("Error updating courier booking status:", error)
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 })
  }
}
