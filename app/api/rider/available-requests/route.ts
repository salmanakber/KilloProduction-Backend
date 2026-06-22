import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import { getCustomerRating, getCustomerRideHistory } from "@/lib/customer-rider-context"
import {
  buildRiderServiceFilter,
  courierMatchesRider,
  rideBookingMatchesRider,
} from "@/lib/rider-request-eligibility"
import {
  RIDE_BROADCAST_TTL_MS,
  NON_RIDE_BROADCAST_TTL_MS,
  calculateMaxBidCapAmount,
  computeRequestListingExpiresMs,
  haversineKm,
  isScheduledRequestVisible,
} from "@/lib/rider-available-requests-shared"
import { getRidingBiddingPolicy, ridingBidTtlSec } from "@/lib/riding-bid-expiry"

function activePendingBids<T extends { status?: string; expiresAt?: Date | string; createdAt?: Date | string }>(bids: T[]): T[] {
  const now = Date.now()
  const ttlSec = ridingBidTtlSec()
  return (bids || []).filter((b) => {
    if (String(b.status ?? "PENDING").toUpperCase() !== "PENDING") return false
    if (b.createdAt) {
      const start = new Date(b.createdAt).getTime()
      if (Number.isFinite(start) && Math.floor((now - start) / 1000) >= ttlSec) return false
    }
    if (b.expiresAt && new Date(b.expiresAt).getTime() <= now) return false
    return true
  })
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

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

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
    const courierVisible = courierFiltered.filter((b) => isScheduledRequestVisible(b.scheduledAt))

    
    

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
    const rideVisible = rideFiltered.filter((b) => isScheduledRequestVisible(b.scheduledAt))

    const nowTs = Date.now()

    // Process courier bookings - NO distance calculations here
    const processedCourierBookings = courierVisible.map((booking) => {
      const ttlMs = (booking.module || "RIDE") === "RIDE" ? RIDE_BROADCAST_TTL_MS : NON_RIDE_BROADCAST_TTL_MS
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
        bids: activePendingBids(booking.bids || []),
        rideType: booking.rideType,
        scheduledAt: booking.scheduledAt,
        createdAt: booking.createdAt,
        customer: booking.customer,
        hasCoordinates: !!(booking.pickupLatitude && booking.pickupLongitude && booking.dropLatitude && booking.dropLongitude),
        orderId: (booking as any).orderId || null,
        module: booking.module ?? null,
        expiresAt: expiresAt.toISOString(),
        broadcastExpiresAt: new Date(broadcastEndMs).toISOString(),
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
      const broadcastEndMs = baseTs + RIDE_BROADCAST_TTL_MS
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
        bids: activePendingBids(booking.rideBids || []),
        rideBids: booking.rideBids,
        rideType: booking.rideType,
        scheduledAt: booking.scheduledAt,
        createdAt: booking.createdAt,
        customer: booking.customer,
        hasCoordinates: !!(booking.pickupLatitude && booking.pickupLongitude && booking.dropLatitude && booking.dropLongitude),
        testing: 'testing',
        module: "CUSTOMER",
        expiresAt: expiresAt.toISOString(),
        broadcastExpiresAt: new Date(broadcastEndMs).toISOString(),
        isExpiredByTime: nowTs >= listingEndMs,
      }
    })

    // Combine all requests
    const allRequests = [...processedCourierBookings, ...processedRideBookings]
// Calculate distances for all requests first
const withDistances = allRequests.map((request) => {
  if (effectiveRiderLat === 0 && effectiveRiderLng === 0) {
    return { ...request, isWithinRange: true }
  }

  const distanceToPickup = haversineKm(
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
      biddingPolicy: getRidingBiddingPolicy(),
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