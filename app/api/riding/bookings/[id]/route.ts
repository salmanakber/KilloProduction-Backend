import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bookingId = params.id

    // Try to find the booking in both ride_bookings and courier_bookings
    const [rideBooking, courierBooking] = await Promise.all([
      prisma.rideBooking.findFirst({
        where: {
          id: bookingId,
          customerId: user.id, // Ensure customer owns the booking
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              avatar: true,
            },
          },
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
                  totalRides: true,
                  currentLocation: true,
                },
              },
            },
          },
          rideType: {
            select: {
              id: true,
              name: true,
              icon: true,
              basePrice: true,
              pricePerKm: true,
              pricePerMinute: true,
              vehicleType: true,
              description: true,
            },
          },
          rideBids: {
            where: {
              status: {
                in: ['PENDING', 'ACCEPTED']
              }
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
                      totalRides: true,
                      currentLocation: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
          rideTracking: {
            orderBy: { timestamp: "desc" },
            take: 10,
          },
        },
      }),
      prisma.courierBooking.findFirst({
        where: {
          id: bookingId,
          customerId: user.id, // Ensure customer owns the booking
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              avatar: true,
            },
          },
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
                  totalRides: true,
                  currentLocation: true,
                },
              },
            },
          },
          rideType: {
            select: {
              id: true,
              name: true,
              icon: true,
              basePrice: true,
              pricePerKm: true,
              pricePerMinute: true,
              vehicleType: true,
              description: true,
            },
          },
          bids: {
            where: {
              status: {
                in: ['PENDING', 'ACCEPTED']
              }
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
                      totalRides: true,
                      currentLocation: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
          trackingUpdates: {
            orderBy: { timestamp: "desc" },
            take: 10,
          },
          pharmacyPickups: {
            orderBy: {
              pickupOrder: 'asc',
            },
          },
        },
      }),
    ])

    const booking = rideBooking || courierBooking

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    // Format the response consistently
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
      customer: booking.customer,
      rider: booking.rider,
      rideType: booking.rideType,
      scheduledAt: booking.scheduledAt,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      trackingUpdates: booking.trackingUpdates,
      // Bids - use rideBids for ride bookings, bids for courier bookings
      bids: rideBooking ? (booking as any).rideBids : (booking as any).bids,
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
        orderId: (booking as any).orderId,
        pharmacyPickups: (booking as any).pharmacyPickups,
      }),
    }

    return NextResponse.json({
      success: true,
      booking: formattedBooking,
    })
  } catch (error) {
    console.error("Error fetching booking:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to fetch booking",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
