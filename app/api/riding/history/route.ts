import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Build where clause for both models
    const whereClause: any = {
      customerId: user.id,
    }

    // Add status filter if provided
    if (status && status !== 'ALL') {
      whereClause.status = { in: status.split(',') }
    }

    // Fetch both RideBookings and CourierBookings
    const [rideBookings, courierBookings, rideCount, courierCount] = await Promise.all([
      prisma.rideBooking.findMany({
        where: whereClause,
        include: {
          rider: {
            select: {
              id: true,
              name: true,
              phone: true,
            }
          },
          rideType: {
            select: {
              id: true,
              name: true,
              icon: true,
              vehicleType: true,
              category: true,
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: offset,
        take: limit,
}),
      prisma.courierBooking.findMany({
        where: whereClause,
        include: {
          rider: {
            select: {
              id: true,
              name: true,
              phone: true,
            }
          },
          riderProfile: {
            select: {
              vehicleType: true,
              licensePlate: true,
              rating: true,
            }
          },
          rideType: {
            select: {
              id: true,
              name: true,
              icon: true,
              vehicleType: true,
              category: true,
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: offset,
        take: limit,
      }),
      prisma.rideBooking.count({
        where: whereClause,
      }),
      prisma.courierBooking.count({
        where: whereClause,
      })
    ])

    // Transform RideBookings
    const transformedRideBookings = rideBookings.map(booking => ({
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      type: 'RIDE',
      status: booking.status,
      pickupAddress: booking.pickupAddress,
      dropAddress: booking.dropAddress,
      estimatedFare: booking.estimatedFare,
      finalFare: booking.finalFare,
      createdAt: booking.createdAt.toISOString(),
      rider: booking.rider ? {
        id: booking.rider.id,
        name: booking.rider.name || 'Unknown Rider',
        phone: booking.rider.phone || '',
      } : null,
      rideType: booking.rideType ? {
        id: booking.rideType.id,
        name: booking.rideType.name,
        icon: booking.rideType.icon,
        vehicleType: booking.rideType.vehicleType,
        category: booking.rideType.category,
      } : null,
      distance: booking.distance,
      estimatedTime: booking.estimatedTime,
    }))

    // Transform CourierBookings
    const transformedCourierBookings = courierBookings.map(booking => ({
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      type: 'COURIER',
      status: booking.status,
      pickupAddress: booking.pickupAddress,
      dropAddress: booking.dropAddress,
      estimatedFare: booking.fare,
      finalFare: booking.fare, // CourierBooking uses 'fare' field
      createdAt: booking.createdAt.toISOString(),
      rider: booking.rider ? {
        id: booking.rider.id,
        name: booking.rider.name || 'Unknown Rider',
        phone: booking.rider.phone || '',
        vehicleType: booking.riderProfile?.vehicleType,
        licensePlate: booking.riderProfile?.licensePlate,
        rating: booking.riderProfile?.rating,
      } : null,
      rideType: booking.rideType ? {
        id: booking.rideType.id,
        name: booking.rideType.name,
        icon: booking.rideType.icon,
        vehicleType: booking.rideType.vehicleType,
        category: booking.rideType.category,
      } : null,
      distance: booking.distance,
      estimatedTime: booking.estimatedTime,
    }))

    // Combine and sort all bookings by creation date
    const allBookings = [...transformedRideBookings, ...transformedCourierBookings]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const totalCount = rideCount + courierCount

    return NextResponse.json({
      success: true,
      bookings: allBookings,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1,
      }
    })

  } catch (error) {
    console.error("Error fetching ride history:", error)
    return NextResponse.json({ 
      success: false,
      error: "Failed to fetch ride history" 
    }, { status: 500 })
  }
}
