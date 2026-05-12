import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getCustomerRating, getCustomerRideHistory } from "@/lib/customer-rider-context"
import {
  buildRiderServiceFilter,
  courierMatchesRider,
  rideBookingMatchesRider,
} from "@/lib/rider-request-eligibility"

// Helper function to calculate distance between two points using Haversine formula
import axios from "axios"

const DEFAULT_BID_CAP_PERCENT = 20

function getBidCapPercent(): number {
  const raw = Number(process.env.RIDING_BID_CAP_PERCENT ?? DEFAULT_BID_CAP_PERCENT)
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_BID_CAP_PERCENT
  return raw
}

function calculateMaxBidCapAmount(estimatedFare: number): number {
  const capPercent = getBidCapPercent()
  const capped = estimatedFare * (1 + capPercent / 100)
  return Math.round(capped * 100) / 100
}

/** Listing stays visible until broadcast ends or the last still-active PENDING bid expires (whichever is later). */
function computeRequestListingExpiresMs(params: {
  broadcastEndMs: number
  bids: Array<{ status?: string | null; expiresAt?: Date | string | null }>
  nowTs: number
}): number {
  const pending = params.bids.filter(
    (b) => String(b?.status ?? "PENDING").toUpperCase() === "PENDING"
  )
  const activePending = pending.filter((b) => {
    if (!b?.expiresAt) return false
    const t = new Date(b.expiresAt as Date).getTime()
    return Number.isFinite(t) && t > params.nowTs
  })
  if (activePending.length === 0) return params.broadcastEndMs
  const maxBidMs = Math.max(
    ...activePending.map((b) => new Date(b.expiresAt as Date).getTime())
  )
  return Math.max(params.broadcastEndMs, maxBidMs)
}

async function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): Promise<number> {
  const R = 6371e3 // Earth's radius in kilometers
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c // in kilometers

  // ✅ If distance is within 5km, return directly
  if (distance <= 5) {
    return distance * 1000
  }

  // ✅ If distance is within 5km, return directly
  if (distance <= 5000) {
    return distance / 1000
  }

  // 🚀 Else call Google Directions API for accurate distance
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${lat1},${lng1}&destination=${lat2},${lng2}&mode=driving&key=${apiKey}`
    )

    if (
      response.data.routes &&
      response.data.routes.length > 0 &&
      response.data.routes[0].legs &&
      response.data.routes[0].legs.length > 0
    ) {
      const meters = response.data.routes[0].legs[0].distance.value
      return meters / 1000 // distance in kilometers
    } else {
      console.warn("⚠️ Google Directions returned no routes, fallback to haversine")
      return distance / 1000
    }
  } catch (err) {
    console.error("❌ Error fetching from Google Directions:", err)
    return distance / 1000 // fallback to haversine
  }
}


/**
 * This endpoint fetches request data from the database and filters by rider's maxDeliveryDistance
 * Distance calculations for display are handled by the frontend distanceService
 */

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const riderLat = searchParams.get('riderLat')
    const riderLng = searchParams.get('riderLng')

    const userId = session.id

    const riderProfile = await prisma.riderProfile.findUnique({
      where: { userId },
      select: {
        maxDeliveryDistance: true,
        currentLocation: true,
        serviceTypes: true,
        modules: true,
        vehicleType: true,
      },
    })

    if (!riderProfile) {
      return NextResponse.json({ error: "Rider profile not found" }, { status: 404 })
    }

    // Extract location from currentLocation JSON or use request parameters as fallback
    let effectiveRiderLat = parseFloat(riderLat || '0')
    let effectiveRiderLng = parseFloat(riderLng || '0')
    
    if (riderProfile.currentLocation && typeof riderProfile.currentLocation === 'object') {
      const location = riderProfile.currentLocation as any
      if (location.latitude && location.longitude) {
        effectiveRiderLat = location.latitude
        effectiveRiderLng = location.longitude
      }
    }

    const maxDeliveryDistance = riderProfile.maxDeliveryDistance || 10 // Default 10km if not set
    

    const riderFilter = buildRiderServiceFilter(
      riderProfile.serviceTypes,
      riderProfile.modules,
      riderProfile.vehicleType
    )

    // Build where clause
    const whereClause: any = {}
    
    if (type && type !== 'all') {
      // whereClause.type = type.toUpperCase()
    }
    
    if (status && status !== 'all') {
      whereClause.status = status.toUpperCase()
    }

    // Get courier bookings - only REQUESTED status, exclude BIDDING
    const courierBookings = await prisma.courierBooking.findMany({
      where: {
        ...whereClause,
        status: {
          in: ['REQUESTED', 'BIDDING']
        }  // Only show REQUESTED status, not BIDDING
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
          }
        },
        bids: true,
        multiplePickups: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            sequence: true,
            storeName: true,
            storeAddress: true,
            storeLatitude: true,
            storeLongitude: true,
            status: true,
            pickedUpAt: true,
            distanceFromPrevious: true,
            durationFromPrevious: true,
            module: true,
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
            vehicleType: true,
            category: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    

    const courierFiltered = courierBookings.filter((b) =>
      courierMatchesRider(riderFilter, b.module, b.rideType.vehicleType)
    )
    const courierVisible = courierFiltered.filter((b) => {
      if (!b.scheduledAt) return true
      return new Date(b.scheduledAt).getTime() <= Date.now()
    })

    
    

    // Get ride bookings - only REQUESTED status, exclude BIDDING
    const rideBookings = await prisma.rideBooking.findMany({
      where: {
        ...whereClause,
        status: {
          in: ['REQUESTED', 'BIDDING']
        } // Only show REQUESTED status, not BIDDING
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
          }
        },
        rideBids: true,
        rideType: {
          select: {
            id: true,
            name: true,
            basePrice: true,
            pricePerKm: true,
            pricePerMinute: true,
            icon: true,
            description: true,
            vehicleType: true,
            category: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const rideFiltered = rideBookings.filter((b) =>
      rideBookingMatchesRider(riderFilter, b.rideType.vehicleType)
    )
    const rideVisible = rideFiltered.filter((b) => {
      if (!b.scheduledAt) return true
      return new Date(b.scheduledAt).getTime() <= Date.now()
    })

    const nowTs = Date.now()
    const rideMaxAgeMs = 90 * 1000
    const nonRideMaxAgeMs = 90 * 60 * 1000

    // Process courier bookings - NO distance calculations here
    const processedCourierBookings = courierVisible.map((booking) => {
      const ttlMs = (booking.module || "RIDE") === "RIDE" ? rideMaxAgeMs : nonRideMaxAgeMs
      const baseTs = booking.scheduledAt ? new Date(booking.scheduledAt).getTime() : new Date(booking.createdAt).getTime()
      const broadcastEndMs = baseTs + ttlMs
      const listingEndMs = computeRequestListingExpiresMs({
        broadcastEndMs,
        bids: booking.bids || [],
        nowTs,
      })
      const expiresAt = new Date(listingEndMs)
      const estimatedFare = booking.fare || 0
      return {
        id: booking.id,
        type: 'courier' as const,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        pickupAddress: booking.pickupAddress || '',
        pickupLatitude: booking.pickupLatitude || 0,
        pickupLongitude: booking.pickupLongitude || 0,
        pickupLandmark: null, // CourierBooking doesn't have pickupLandmark
        dropAddress: booking.dropAddress || '',
        dropLatitude: booking.dropLatitude || 0,
        dropLongitude: booking.dropLongitude || 0,
        dropLandmark: null, // CourierBooking doesn't have dropLandmark
        // Distance calculations will be handled by distanceService on the frontend
        distance: booking.distance || 0,
        estimatedTime: booking.estimatedTime,
        estimatedFare,
        fare: estimatedFare,
        maxBidCapAmount: calculateMaxBidCapAmount(estimatedFare),
        paymentStatus: (booking as any).paymentStatus || 'PENDING',
        paymentMethod: (booking as any).paymentMethod || null,
        packageType: booking.packageType,
        packageWeight: booking.packageWeight,
        isFragile: booking.isFragile,
        recipientName: booking.recipientName,
        recipientPhone: booking.recipientPhone,
        notes: booking.notes,
        bids: booking.bids,
        rideType: booking.rideType,
        scheduledAt: booking.scheduledAt,
        createdAt: booking.createdAt,
        customer: booking.customer,
        hasCoordinates: !!(booking.pickupLatitude && booking.pickupLongitude && booking.dropLatitude && booking.dropLongitude),
        orderId: (booking as any).orderId || null,
        module: booking.module ?? null,
        expiresAt: expiresAt.toISOString(),
        isExpiredByTime: nowTs >= listingEndMs,
        multiplePickups: booking.multiplePickups?.map((mp: any) => ({
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
        })) || [],
      }
    })

    // Process ride bookings - NO distance calculations here
    const processedRideBookings = rideVisible.map((booking) => {
      const baseTs = booking.scheduledAt
        ? new Date(booking.scheduledAt).getTime()
        : new Date((booking as any).requestedAt || booking.createdAt).getTime()
      const broadcastEndMs = baseTs + rideMaxAgeMs
      const listingEndMs = computeRequestListingExpiresMs({
        broadcastEndMs,
        bids: booking.rideBids || [],
        nowTs,
      })
      const expiresAt = new Date(listingEndMs)
      const estimatedFare = booking.estimatedFare || 0
      return {
        id: booking.id,
        type: 'ride' as const,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        pickupAddress: booking.pickupAddress || '',
        pickupLatitude: booking.pickupLatitude || 0,
        pickupLongitude: booking.pickupLongitude || 0,
        pickupLandmark: booking.pickupLandmark,
        dropAddress: booking.dropAddress || '',
        dropLatitude: booking.dropLatitude || 0,
        dropLongitude: booking.dropLongitude || 0,
        dropLandmark: booking.dropLandmark,
        // Distance calculations will be handled by distanceService on the frontend
        distance: booking.distance || 0, // Will be calculated by distanceService
        estimatedTime: booking.estimatedTime || 0, // Will be calculated by distanceService
        estimatedFare, // Will be calculated by distanceService
        fare: estimatedFare,
        maxBidCapAmount: calculateMaxBidCapAmount(estimatedFare),
        paymentStatus: (booking as any).paymentStatus || 'PENDING',
        paymentMethod: (booking as any).paymentMethod || null,
        passengerCount: booking.passengerCount,
        passengerPhone: booking.passengerPhone,
        specialRequests: booking.specialRequests,
        bids: booking.rideBids,
        rideBids: booking.rideBids,
        rideType: booking.rideType,
        scheduledAt: booking.scheduledAt,
        createdAt: booking.createdAt,
        customer: booking.customer,
        hasCoordinates: !!(booking.pickupLatitude && booking.pickupLongitude && booking.dropLatitude && booking.dropLongitude),
        testing: 'testing',
        module: "CUSTOMER",
        expiresAt: expiresAt.toISOString(),
        isExpiredByTime: nowTs >= listingEndMs,
      }
    })

    // Combine all requests
    const allRequests = [...processedCourierBookings, ...processedRideBookings]
// Calculate distances for all requests first
const withDistances = await Promise.all(
  allRequests.map(async (request) => {
    if (effectiveRiderLat === 0 && effectiveRiderLng === 0) {
      return { ...request, isWithinRange: true }
    }


    const distanceToPickup = await calculateDistance(
      effectiveRiderLat,
      effectiveRiderLng,
      request.pickupLatitude,
      request.pickupLongitude
    )



    return {
      ...request,
      isWithinRange: distanceToPickup <= maxDeliveryDistance,
    }
  })
)

// Now filter based on calculated flag
const filteredRequests = withDistances.filter(req => req.isWithinRange && !req.isExpiredByTime)

// Sort by closest first, then newest
const sortedRequests = filteredRequests.sort(
  (a, b) => {
    const distanceDelta = Number(a.distance || 0) - Number(b.distance || 0)
    if (Math.abs(distanceDelta) > 0.001) return distanceDelta
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  }
)

    const uniqueCustomerIds = Array.from(new Set(sortedRequests.map((r) => r.customer.id)))
    const customerContextEntries = await Promise.all(
      uniqueCustomerIds.map(async (customerId) => {
        const [customerRating, rideHistoryResult] = await Promise.all([
          getCustomerRating(customerId),
          getCustomerRideHistory(customerId, 25),
        ])
        return [
          customerId,
          {
            customerRating,
            rideHistory: rideHistoryResult.rides,
            ridesTotalCount: rideHistoryResult.totalCount,
          },
        ] as const
      })
    )
    const customerContextById = new Map(customerContextEntries)

    const sortedWithCustomerContext = sortedRequests.map((req) => {
      const ctx = customerContextById.get(req.customer.id)
      return {
        ...req,
        customer: {
          ...req.customer,
          profilePicture: (req.customer as { avatar?: string | null }).avatar ?? undefined,
          customerRating: ctx?.customerRating ?? { average: 0, totalReviews: 0 },
          rideHistory: ctx?.rideHistory ?? [],
          ridesTotalCount: ctx?.ridesTotalCount ?? 0,
        },
      }
    })

    

    return NextResponse.json({
      success: true,
      requests: sortedWithCustomerContext,
      total: sortedWithCustomerContext.length,
      riderInfo: {
        currentLatitude: effectiveRiderLat,
        currentLongitude: effectiveRiderLng,
        maxDeliveryDistance: maxDeliveryDistance,
        totalRequestsFound: allRequests.length,
        requestsWithinRange: sortedWithCustomerContext.length
      }
    })

  } catch (error) {
    console.error("Error fetching available requests:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch available requests",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}