import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Build where clause
    const whereClause: any = {
      riderId: session.id,
    }

    if (status && status !== 'ALL') {
      whereClause.status = { in: status.split(',') }
    }

    // Fetch both RideBookings and CourierBookings
    const [rideBookings, courierBookings, rideCount, courierCount] = await Promise.all([
      prisma.rideBooking.findMany({
        where: whereClause,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true,
            }
          },
          rideType: {
            select: {
              id: true,
              name: true,
              category: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.courierBooking.findMany({
        where: whereClause,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true,
            }
          },
          rideType: {
            select: {
              id: true,
              name: true,
              category: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.rideBooking.count({ where: whereClause }),
      prisma.courierBooking.count({ where: whereClause }),
    ])

    // Get reviews for all bookings
    const bookingIds = [
      ...rideBookings.map(b => b.id),
      ...courierBookings.map(b => b.id),
    ]

    const reviews = await prisma.review.findMany({
      where: {
        OR: [
          { bookingID: { in: bookingIds } },
          { riderId: session.id },
        ],
      },
      include: {
        target: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    // Create a map of booking ID to review
    const reviewMap = new Map()
    reviews.forEach(review => {
      if (review.bookingID) {
        reviewMap.set(review.bookingID, {
          id: review.id,
          rating: review.rating,
          title: review.title,
          comment: review.comment,
          createdAt: review.createdAt.toISOString(),
          customer: review.target,
        })
      }
    })

    // Transform RideBookings
    const transformedRideBookings = rideBookings.map(booking => ({
      id: booking.id,
      type: 'ride' as const,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      pickupAddress: booking.pickupAddress,
      dropAddress: booking.dropAddress,
      pickupLatitude: booking.pickupLatitude,
      pickupLongitude: booking.pickupLongitude,
      dropLatitude: booking.dropLatitude,
      dropLongitude: booking.dropLongitude,
      distance: booking.distance,
      estimatedFare: booking.estimatedFare,
      finalFare: booking.finalFare,
      fare: booking.finalFare || booking.estimatedFare,
      customer: booking.customer,
      rideType: booking.rideType,
      customerRating: booking.customerRating,
      customerReview: booking.customerReview,
      riderRating: booking.riderRating,
      riderReview: booking.riderReview,
      createdAt: booking.createdAt.toISOString(),
      completedAt: booking.completedAt?.toISOString(),
      review: reviewMap.get(booking.id) || null,
    }))

    // Transform CourierBookings
    const transformedCourierBookings = courierBookings.map(booking => ({
      id: booking.id,
      type: 'courier' as const,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      pickupAddress: booking.pickupAddress,
      dropAddress: booking.dropAddress,
      pickupLatitude: booking.pickupLatitude,
      pickupLongitude: booking.pickupLongitude,
      dropLatitude: booking.dropLatitude,
      dropLongitude: booking.dropLongitude,
      distance: booking.distance,
      estimatedFare: booking.fare,
      finalFare: booking.fare,
      fare: booking.fare,
      customer: booking.customer,
      rideType: booking.rideType,
      customerRating: booking.customerRating,
      customerReview: booking.customerReview,
      riderRating: booking.riderRating,
      riderReview: booking.riderReview,
      createdAt: booking.createdAt.toISOString(),
      completedAt: booking.deliveredAt?.toISOString(),
      review: reviewMap.get(booking.id) || null,
    }))

    // Combine and sort
    const allBookings = [...transformedRideBookings, ...transformedCourierBookings]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({
      success: true,
      data: allBookings,
      pagination: {
        page,
        limit,
        total: rideCount + courierCount,
        totalPages: Math.ceil((rideCount + courierCount) / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching rider ride history:", error)
    return NextResponse.json(
      { error: "Failed to fetch ride history" },
      { status: 500 }
    )
  }
}




