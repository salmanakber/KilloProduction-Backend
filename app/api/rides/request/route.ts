import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      rideTypeId,
      pickupAddress,
      pickupLatitude,
      pickupLongitude,
      dropAddress,
      dropLatitude,
      dropLongitude,
      passengerCount,
      specialRequests,
      scheduledAt,
    } = await request.json()

    // Get ride type details
    const rideType = await prisma.rideType.findUnique({
      where: { id: rideTypeId },
    })

    if (!rideType) {
      return NextResponse.json({ error: "Invalid ride type" }, { status: 400 })
    }

    // Calculate distance and estimated fare
    const distance = calculateDistance(pickupLatitude, pickupLongitude, dropLatitude, dropLongitude)
    const estimatedTime = Math.ceil(distance * 3) // 3 minutes per km
    const estimatedFare = rideType.basePrice + distance * rideType.pricePerKm + estimatedTime * rideType.pricePerMinute

    // Generate booking number
    const bookingNumber = `RB${Date.now()}${Math.floor(Math.random() * 1000)}`

    // Create ride booking
    const rideBooking = await prisma.rideBooking.create({
      data: {
        bookingNumber,
        customerId: session.id,
        rideTypeId,
        pickupAddress,
        pickupLatitude,
        pickupLongitude,
        dropAddress,
        dropLatitude,
        dropLongitude,
        distance,
        estimatedTime,
        estimatedFare,
        passengerCount: passengerCount || 1,
        specialRequests,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        rideType: "EXTERNAL",
        status: "REQUESTED",
      },
      include: {
        customer: {
          select: { userProfile: { select: { firstName: true, lastName: true, phone: true } } },
        },
        rideType: true,
      },
    })

    // Find nearby available riders
    const nearbyRiders = await findNearbyRiders(pickupLatitude, pickupLongitude, 10) // 10km radius

    // Send notifications to nearby riders
    for (const rider of nearbyRiders) {
      await sendRideRequestNotification(rider.id, rideBooking.id)
    }

    // Note: WebSocket notifications are now handled automatically by database change tracking middleware

    // Set expiry for the request (10 minutes)
    setTimeout(
      async () => {
        await expireRideRequest(rideBooking.id)
      },
      10 * 60 * 1000,
    )

    return NextResponse.json({
      rideBooking,
      message: "Ride request sent to nearby riders",
      estimatedWaitTime: "2-5 minutes",
    })
  } catch (error) {
    console.error("Error creating ride request:", error)
    return NextResponse.json({ error: "Failed to create ride request" }, { status: 500 })
  }
}

// Helper function to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of the Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c
  return Math.round(distance * 100) / 100
}

// Helper function to find nearby riders
async function findNearbyRiders(lat: number, lng: number, radiusKm: number) {
  // This is a simplified version - in production, use proper geospatial queries
  const riders = await prisma.user.findMany({
    where: {
      role: "RIDER",
      riderProfile: {
        isOnline: new Date().toISOString(),
        isAvailable: true,
        isApproved: true,
        serviceTypes: { has: "EXTERNAL" },
      },
    },
    include: {
      riderProfile: true,
    },
  })

  // Filter by distance (simplified - in production, use database geospatial functions)
  return riders.filter((rider) => {
    if (!rider.riderProfile?.currentLocation) return false
    const riderLocation = rider.riderProfile.currentLocation as any
    const distance = calculateDistance(lat, lng, riderLocation.lat, riderLocation.lng)
    return distance <= radiusKm
  })
}

// Helper function to send ride request notification
async function sendRideRequestNotification(riderId: string, rideBookingId: string) {
  // TODO: Implement push notification
  console.log(`Sending ride request notification to rider ${riderId} for booking ${rideBookingId}`)
}

// Helper function to expire ride request
async function expireRideRequest(rideBookingId: string) {
  try {
    const booking = await prisma.rideBooking.findUnique({
      where: { id: rideBookingId },
    })

    if (booking && booking.status === "REQUESTED") {
      await prisma.rideBooking.update({
        where: { id: rideBookingId },
        data: { status: "EXPIRED" },
      })

      // Notify customer that request expired
      // TODO: Send notification to customer
    }
  } catch (error) {
    console.error("Error expiring ride request:", error)
  }
}
