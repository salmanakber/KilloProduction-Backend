import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { sendEmailFromTemplate } from "@/lib/email"
import { socketIOServer } from "@/lib/socket-server"
import { runCourierCompletionSideEffects } from "@/lib/courier-post-completion"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)
    
    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bookingId = params.id

    // Try to find the booking in both ride_bookings and courier_bookings
    const [rideBooking, courierBooking] = await Promise.all([
      prisma.rideBooking.findFirst({
        where: {
          id: bookingId,
          riderId: session.id,
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true,
            },
          },
          rideType: {
            select: {
              id: true,
              name: true,
              basePrice: true,
              pricePerKm: true,
              pricePerMinute: true,
              icon: true,
              description: true,
            },
          },
        },
      }),
      prisma.courierBooking.findFirst({
        where: {
          id: bookingId,
          riderId: session.id,
        },
        include: {
          supplierOrders: true, // Include supplier orders for courier bookings
          multiplePickups: {
            orderBy: { sequence: 'asc' },
            include: {
              restaurant: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                  latitude: true,
                  longitude: true,
                },
              },
              groceryStore: {
                select: {
                  id: true,
                  storeName: true,
                  address: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true,
            },
          },

          rideType: {
            select: {
              id: true,
              name: true,
              basePrice: true,
              pricePerKm: true,
              pricePerMinute: true,
              icon: true,
              description: true,
            },
          },
        },
      }),
    ])

    const booking = rideBooking || courierBooking

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    let pharmacyById: Record<
      string,
      { id: string; pharmacyName: string; phone: string; logo: string | null; address: string }
    > = {}
    if (courierBooking?.multiplePickups?.length) {
      const pharmacyIds = Array.from(
        new Set(
          courierBooking.multiplePickups
            .map((p: { pharmacyId?: string | null }) => p.pharmacyId)
            .filter(Boolean) as string[]
        )
      )
      if (pharmacyIds.length > 0) {
        const pharmacies = await prisma.pharmacy.findMany({
          where: { id: { in: pharmacyIds } },
          select: {
            id: true,
            pharmacyName: true,
            phone: true,
            logo: true,
            address: true,
          },
        })
        pharmacyById = Object.fromEntries(pharmacies.map((ph) => [ph.id, ph]))
      }
    }

    // Format the response based on booking type
    const formattedBooking = {
      id: booking.id,
      type: rideBooking ? 'ride' : 'courier',
      bookingNumber: booking.bookingNumber,
      customerId: booking.customerId,
      riderId: booking.riderId,
      status: booking.status,
      pickupAddress: booking.pickupAddress,
      dropAddress: booking.dropAddress,
      pickupLatitude: booking.pickupLatitude,
      pickupLongitude: booking.pickupLongitude,
      dropLatitude: booking.dropLatitude,
      dropLongitude: booking.dropLongitude,
      distance: booking.distance,
      estimatedTime: booking.estimatedTime,
      estimatedFare: rideBooking ? (booking as any).estimatedFare : (booking as any).fare,
      finalFare: rideBooking ? (booking as any).finalFare : (booking as any).fare,
      fare: rideBooking ? (booking as any).fare : (booking as any).fare,
      paymentStatus: (booking as any).paymentStatus || 'PENDING',
      paymentMethod: (booking as any).paymentMethod || null,
      customer: booking.customer,
      rideType: booking.rideType,
      scheduledAt: booking.scheduledAt,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      // Additional fields for ride bookings
      ...(rideBooking && {
        pickupLandmark: (booking as any).pickupLandmark,
        dropLandmark: (booking as any).dropLandmark,
        passengerCount: (booking as any).passengerCount,
        passengerPhone: (booking as any).passengerPhone,
        specialRequests: (booking as any).specialRequests,
        surgePricing: (booking as any).surgePricing,
        acceptedAt: (booking as any).acceptedAt,
        arrivedAt: (booking as any).arrivedAt,
        pickedUpAt: (booking as any).pickedUpAt,
        completedAt: (booking as any).completedAt,
        cancelledAt: (booking as any).cancelledAt,
        customerRating: (booking as any).customerRating,
        riderRating: (booking as any).riderRating,
        customerReview: (booking as any).customerReview,
        riderReview: (booking as any).riderReview,
      }),
      // Additional fields for courier bookings
      ...(courierBooking && {
        notes: (booking as any).notes,
        recipientName: (booking as any).recipientName,
        recipientPhone: (booking as any).recipientPhone,
        packageType: (booking as any).packageType,
        packageWeight: (booking as any).packageWeight,
        isFragile: (booking as any).isFragile,
        pickedUpAt: (booking as any).pickedUpAt,
        deliveredAt: (booking as any).deliveredAt,
        cancelledAt: (booking as any).cancelledAt,
        supplierOrders: (booking as any).supplierOrders,
        orderId: (booking as any).orderId,
        multiplePickups: (booking as any).multiplePickups?.map((mp: any) => ({
          id: mp.id,
          sequence: mp.sequence,
          storeName: mp.storeName,
          address: mp.storeAddress,
          latitude: mp.storeLatitude,
          longitude: mp.storeLongitude,
          status: mp.status,
          pickedUpAt: mp.pickedUpAt,
          distanceFromPrevious: mp.distanceFromPrevious,
          durationFromPrevious: mp.durationFromPrevious,
          module: mp.module,
          pharmacyId: mp.pharmacyId,
          restaurant: mp.restaurant,
          groceryStore: mp.groceryStore,
          pharmacy: mp.pharmacyId ? pharmacyById[mp.pharmacyId] ?? null : null,
        })) || [],
      }),
    }

    

    return NextResponse.json(formattedBooking)
  } catch (error) {
    console.error("Error fetching booking details:", error)
    return NextResponse.json({ error: "Failed to fetch booking details" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)
    
    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bookingId = params.id
    const body = await request.json()
    const { status, latitude, longitude, notes } = body

    // Try to find the booking in both ride_bookings and courier_bookings
    const [rideBooking, courierBooking] = await Promise.all([
      prisma.rideBooking.findFirst({
        where: {
          id: bookingId,
          riderId: session.id,
        },
      }),
      prisma.courierBooking.findFirst({
        where: {
          id: bookingId,
          riderId: session.id,
        },
      }),
    ])

    const booking = rideBooking || courierBooking

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    // Update the booking status
    let updatedBooking
    
    if (rideBooking) {
      
      updatedBooking = await prisma.rideBooking.update({
        where: { id: bookingId },
        data: {
          status: status,
          ...(status === 'ARRIVED' && { arrivedAt: new Date() }),
          ...(status === 'PICKED_UP' && { pickedUpAt: new Date() }),
          ...(status === 'COMPLETED' && { completedAt: new Date() }),
          ...(status === 'CANCELLED' && { cancelledAt: new Date() }),
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true,
              email: true,
            },
          },
        },
      })
    }else {
      updatedBooking = await prisma.courierBooking.update({
        where: { id: bookingId },
        data: {
          status: status,
          ...(status === 'PICKED_UP' && { pickedUpAt: new Date() }),
          ...(status === 'DELIVERED' && { deliveredAt: new Date() }),
          ...(status === 'CANCELLED' && { cancelledAt: new Date() }),
          ...(status === 'COMPLETED' && { deliveredAt: new Date() }),
        },
        include: {
          supplierOrders: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true,
              email: true,
              },
          },
        },
      })
    }

    if (status === "CANCELLED") {
      await prisma.riderProfile.updateMany({
        where: { userId: session.id },
        data: { riderAssignedCancellationCount: { increment: 1 } },
      })
    }

    // Update rider location if provided
    if (latitude && longitude) {
      await prisma.riderProfile.update({
        where: { userId: session.id },
        data: {
          currentLocation: {
            lat: latitude,
            lng: longitude,
            timestamp: new Date().toISOString(),
          },
          lastLocationUpdate: new Date().toISOString(),
        },
      })
    }

    // Add tracking update
    if (rideBooking) {
      await prisma.rideTracking.create({
        data: {
          rideBookingId: bookingId,
          status: status,
          latitude: latitude,
          longitude: longitude,
          notes: notes,
          timestamp: new Date(),
        },
      })
    } else if (courierBooking) {
      await prisma.courierTracking.create({
        data: {
          bookingId: bookingId,
          status: status,
          latitude: latitude,
          longitude: longitude,
          notes: notes,
          timestamp: new Date(),
        },
      })
    }

    // When booking is completed/delivered, update rider earning status to PAID
    if ((rideBooking && status === 'COMPLETED') || (courierBooking && (status === 'COMPLETED' || status === 'DELIVERED'))) {
      try {
        const { markRiderEarningAsPaid } = await import("@/lib/rider-earnings-helper")
        await markRiderEarningAsPaid(
          rideBooking ? bookingId : undefined,
          courierBooking ? bookingId : undefined
        )
      } catch (earningError) {
        console.error("Error updating rider earning status:", earningError)
        // Don't fail the request if earning update fails
      }
    }

    // Wholesaler/pharmacy courier bookings: release pending vendor wallet + commissions (same as food checkout completion)
    if (courierBooking && (status === 'COMPLETED' || status === 'DELIVERED')) {
      try {
        await runCourierCompletionSideEffects(bookingId)
      } catch (completionErr) {
        console.error("runCourierCompletionSideEffects:", completionErr)
      }
    }

    // When booking is completed/delivered, send a review request notification to the customer
    try {
  
      if ((rideBooking && status === 'COMPLETED') || (courierBooking && (status === 'COMPLETED' || status === 'DELIVERED'))) {
        const customerUserId = updatedBooking.customer.id
        const bookingType = rideBooking ? 'RIDING' : 'COURIER'
        const title = rideBooking ? 'Rate Your Ride' : 'Rate Your Delivery'
        const message = rideBooking
          ? 'Your trip is complete. Please rate your rider to help us improve.'
          : 'Your delivery is complete. Please rate your rider to help us improve.'

        await NotificationBridge.sendNotification({
          userId: customerUserId,
          title,
          message,
          type: 'REVIEW_REQUEST',
          module: bookingType,
          actionUrl: rideBooking
            ? `/riding/bookings/${bookingId}/rate`
            : `/courier-bookings/${bookingId}/rate`,
          data: {
            actionType: 'navigate',
            screen: 'RiderFeedbackScreen',
            params: {
              bookingId: bookingId,
            },
            bookingId: bookingId,
            status: status,
            bookingType: bookingType.toLowerCase()
          }
        })

        // Also send WebSocket notification for real-time update
        try {
          await socketIOServer.sendNotificationToUser(customerUserId, {
            type: 'review_request',
            bookingId: bookingId,
            bookingType: bookingType.toLowerCase(),
            bookingNumber: updatedBooking.bookingNumber,
            actionType: 'navigate',
            screen: 'RiderFeedbackScreen',
            params: {
              bookingId: bookingId,
            },
            timestamp: new Date().toISOString()
          })
        } catch (wsError) {
          console.error('Failed to send WebSocket rating notification:', wsError)
        }

        // Send email notification
        try {
          await sendEmailFromTemplate(
            updatedBooking.customer.email,
            'RIDE_FEEDBACK_REQUEST',
            {
              customerName: updatedBooking.customer.name,
              riderName: updatedBooking.rider?.name || 'Rider',
              rideType: bookingType,
              rideId: bookingId,
              feedbackUrl: `${process.env.APP_URL}/riderfeedback/${bookingId}`,
              appName: process.env.APP_NAME || 'App',
            }
          )
        } catch (emailError) {
          console.error('Failed to send feedback email:', emailError)
        }

          
      }
      else
      {
        const bookingType = rideBooking ? 'RIDING' : 'COURIER'
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
            title: rideBooking ? 'Trip Started' : 'Package Picked Up',
            message: rideBooking 
              ? `Your trip has started for booking #${updatedBooking.bookingNumber}`
              : `Your package has been picked up and is on the way for booking #${updatedBooking.bookingNumber}`
          },
          'EN_ROUTE_TO_DROPOFF': {
            title: 'On The Way',
            message: `Your ${rideBooking ? 'trip' : 'delivery'} is on the way to you for booking #${updatedBooking.bookingNumber}`
          },
          'ARRIVED_AT_DROPOFF': {
            title: 'Rider Arrived',
            message: `Your rider has arrived at the ${rideBooking ? 'destination' : 'dropoff location'} for booking #${updatedBooking.bookingNumber}`
          }
        }

        const statusMessage = statusMessages[status] || {
          title: 'Booking Status Update',
          message: `Your booking #${updatedBooking.bookingNumber} status has been updated to ${status}`
        }

        await NotificationBridge.sendNotification({
          userId: updatedBooking.customer.id,
          title: statusMessage.title,
          message: statusMessage.message,
          type: 'ORDER_UPDATE',
          module: bookingType,
          actionUrl: rideBooking
            ? `/riding/bookings/${bookingId}`
            : `/courier-bookings/${bookingId}`,
          data: {
            bookingId: bookingId,
            status: status,
            bookingType: bookingType.toLowerCase()
          }
        })

        // Send WebSocket notification to customer
        try {
          await socketIOServer.sendNotificationToUser(updatedBooking.customer.id, {
            type: 'booking_status_update',
            bookingId: bookingId,
            bookingType: bookingType.toLowerCase(),
            status: status,
            bookingNumber: updatedBooking.bookingNumber,
            riderId: session.id,
            timestamp: new Date().toISOString()
          })
        } catch (wsError) {
          console.error('Failed to send WebSocket notification:', wsError)
        }
      }

        

    } catch (notifyError) {
      console.error('Failed to send rating notification:', notifyError)
    }

    return NextResponse.json({
      success: true,
      booking: updatedBooking,
    })
  } catch (error) {
    console.error("Error updating booking status:", error)
    return NextResponse.json({ error: "Failed to update booking status" }, { status: 500 })
  }
}
