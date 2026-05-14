import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { RideStatus, CourierStatus } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Customer "active" drawer: include EXPIRED so the app can show rebroadcast until the user leaves or creates a new request.
    const activeStatuses: RideStatus[] = [
      'REQUESTED',
      'ACCEPTED', 
      'RIDER_ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'BIDDING',
      'EXPIRED',
      'ARRIVED_AT_PICKUP',
      'ARRIVED_AT_DROPOFF',
      'EN_ROUTE_TO_PICKUP',
      'EN_ROUTE_TO_DROPOFF'
    ]

    // Find active RideBooking
    const activeRideBooking = await prisma.rideBooking.findFirst({
      where: {
        customerId: user.id,
        status: { in: activeStatuses }
      },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
            avatar: true,
            riderProfile: {
              select: {
                id: true,
                vehicleType: true,
                licensePlate: true,
                rating: true,
                averageRating: true,
                totalRides: true,
                totalDeliveries: true,
                currentLocation: true,
              }
            }
          }
        },
        rideType: {
          select: {
            id: true,
            name: true,
            vehicleType: true,
            category: true,
            icon: true,
            waitingGraceMinutes: true,
            waitingPricePerMinute: true,
          }
        },
        rideBids: {
          where: {
            status: 'PENDING'
          },
          include: {
            rider: {
              select: {
                id: true,
                name: true,
                phone: true,
                avatar: true,
                riderProfile: {
                  select: {
                    id: true,
                    vehicleType: true,
                    licensePlate: true,
                    rating: true,
                  }
                }
              }
            },
          },
          orderBy: {
            bidAmount: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Find active CourierBooking (only RIDE module, exclude FOOD/GROCERY/PHARMACY/AUTO_PARTS)
    const activeCourierBooking = await prisma.courierBooking.findFirst({
      where: {
        customerId: user.id,
        status: { in: activeStatuses as CourierStatus[] },
        OR: [
          { module: "RIDE" },
          { module: null },
          { module: "" },
        ]
      },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
            avatar: true,
            riderProfile: {
              select: {
                id: true,
                vehicleType: true,
                licensePlate: true,
                rating: true,
                averageRating: true,
                totalRides: true,
                totalDeliveries: true,
                currentLocation: true,
              }
            }
          }
        },
        rideType: {
          select: {
            id: true,
            name: true,
            vehicleType: true,
            category: true,
            icon: true,
            waitingGraceMinutes: true,
            waitingPricePerMinute: true,
          }
        },
        bids: {
          where: {
            status: 'PENDING'
          },
          include: {
            rider: {
              select: {
                id: true,
                name: true,
                phone: true,
                avatar: true,
                riderProfile: {
                  select: {
                    id: true,
                    vehicleType: true,
                    licensePlate: true,
                    rating: true,
                  }
                }
              }
            },
          },
          orderBy: {
            bidAmount: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    

    // Return the most recent active booking
    let activeBooking: any = null
    let bookingType: 'RIDE' | 'COURIER' | null = null

    if (activeRideBooking && activeCourierBooking) {
      // Both exist, return the most recent one
      if (activeRideBooking.createdAt > activeCourierBooking.createdAt) {
        activeBooking = activeRideBooking
        bookingType = 'RIDE'
      } else {
        activeBooking = activeCourierBooking
        bookingType = 'COURIER'
      }
    } else if (activeRideBooking) {
      activeBooking = activeRideBooking
      bookingType = 'RIDE'
    } else if (activeCourierBooking) {
      activeBooking = activeCourierBooking
      bookingType = 'COURIER'
    }

    if (!activeBooking) {
      return NextResponse.json({
        success: true,
        hasActiveBooking: false,
        booking: null
      })
    }

    if (bookingType === "RIDE") {
      const { expirePendingRideBidsForBooking } = await import("@/lib/riding-bid-expiry")
      await expirePendingRideBidsForBooking(activeBooking.id)
      ;(activeBooking as any).rideBids = await prisma.rideBid.findMany({
        where: { rideBookingId: activeBooking.id, status: "PENDING" },
        include: {
          rider: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true,
              riderProfile: {
                select: {
                  id: true,
                  vehicleType: true,
                  licensePlate: true,
                  rating: true,
                },
              },
            },
          },
        },
        orderBy: { bidAmount: "asc" },
      })
    } else if (bookingType === "COURIER") {
      const { expirePendingCourierBidsForBooking } = await import("@/lib/riding-bid-expiry")
      await expirePendingCourierBidsForBooking(activeBooking.id)
      ;(activeBooking as any).bids = await prisma.courierBid.findMany({
        where: { courierBookingId: activeBooking.id, status: "PENDING" },
        include: {
          rider: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true,
              riderProfile: {
                select: {
                  id: true,
                  vehicleType: true,
                  licensePlate: true,
                  rating: true,
                },
              },
            },
          },
        },
        orderBy: { bidAmount: "asc" },
      })
    }

    // Helper function to calculate rating and trips from Review model
    const getRiderRatingAndTrips = async (riderProfileId: string | null | undefined) => {
      if (!riderProfileId) {
        return { rating: 0, totalTrips: 0 }
      }

      const reviews = await prisma.review.findMany({
        where: { riderId: riderProfileId },
        select: { rating: true }
      })

      const totalTrips = reviews.length
      const rating = totalTrips > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalTrips
        : 0

      return { rating: Math.round(rating * 10) / 10, totalTrips }
    }

    // Get rider rating and trips for active booking rider
    const activeRiderStats = activeBooking.rider?.riderProfile?.id
      ? await getRiderRatingAndTrips(activeBooking.rider.riderProfile.id)
      : { rating: 0, totalTrips: 0 }

    // Get rider rating and trips for all bid riders
    const bidRiders = bookingType === 'RIDE' 
      ? (activeBooking as any).rideBids?.map((bid: any) => bid.rider) || []
      : (activeBooking as any).bids?.map((bid: any) => bid.rider) || []

    const bidRiderStatsMap = new Map()
    await Promise.all(
      bidRiders.map(async (rider: any) => {
        if (rider?.riderProfile?.id) {
          const stats = await getRiderRatingAndTrips(rider.riderProfile.id)
          bidRiderStatsMap.set(rider.id, stats)
        }
      })
    )

    // Transform the booking data
    const broadcastWindowSeconds = 90
    const effectiveRequestedAtMs = (() => {
      const requestedAt = (activeBooking as any).requestedAt
      if (requestedAt instanceof Date && Number.isFinite(requestedAt.getTime())) {
        return requestedAt.getTime()
      }
      const scheduledAt = (activeBooking as any).scheduledAt
      if (scheduledAt instanceof Date && Number.isFinite(scheduledAt.getTime()) && scheduledAt.getTime() <= Date.now()) {
        return scheduledAt.getTime()
      }
      return activeBooking.createdAt.getTime()
    })()

    const toIso = (v: unknown) =>
      v instanceof Date && Number.isFinite(v.getTime()) ? v.toISOString() : v ? String(v) : null

    const transformedBooking = {
      id: activeBooking.id,
      bookingNumber: activeBooking.bookingNumber,
      type: bookingType,
      status: activeBooking.status,
      pickupAddress: activeBooking.pickupAddress,
      pickupLatitude: activeBooking.pickupLatitude,
      pickupLongitude: activeBooking.pickupLongitude,
      dropAddress: activeBooking.dropAddress,
      dropLatitude: activeBooking.dropLatitude,
      dropLongitude: activeBooking.dropLongitude,
      distance: activeBooking.distance,
      estimatedTime: activeBooking.estimatedTime,
      estimatedFare: bookingType === 'RIDE' ? activeBooking.estimatedFare : activeBooking.fare,
      finalFare: bookingType === 'RIDE' ? activeBooking.finalFare : activeBooking.fare,
      paymentStatus: (activeBooking as any).paymentStatus || 'PENDING',
      paymentMethod: (activeBooking as any).paymentMethod || null,
      module: (activeBooking as any).module || null,
      scheduledAt: (activeBooking as any).scheduledAt
        ? (activeBooking as any).scheduledAt.toISOString()
        : null,
      createdAt: activeBooking.createdAt.toISOString(),
      requestedAt: new Date(effectiveRequestedAtMs).toISOString(),
      broadcastExpiresAt: new Date(
        effectiveRequestedAtMs + broadcastWindowSeconds * 1000
      ).toISOString(),
      arrivedAt: toIso((activeBooking as any).arrivedAt),
      pickedUpAt: toIso((activeBooking as any).pickedUpAt),
      pickupWaitingAccruedFee: Number((activeBooking as any).pickupWaitingAccruedFee ?? 0),
      pickupWaitingBillableMinutesCharged: Number((activeBooking as any).pickupWaitingBillableMinutesCharged ?? 0),
      specialRequests:
        bookingType === "RIDE" ? ((activeBooking as any).specialRequests as string | null) ?? null : null,
      notes: bookingType === "COURIER" ? ((activeBooking as any).notes as string | null) ?? null : null,
      packageType: bookingType === "COURIER" ? ((activeBooking as any).packageType as string | null) ?? null : null,
      packageWeight: bookingType === "COURIER" ? (activeBooking as any).packageWeight ?? null : null,
      rider: activeBooking.rider ? {
        id: activeBooking.rider.id,
        name: activeBooking.rider.name || 'Unknown Rider',
        phone: activeBooking.rider.phone || '',
        avatar: activeBooking.rider.avatar,
        vehicleType: activeBooking.rider.riderProfile?.vehicleType,
        licensePlate: activeBooking.rider.riderProfile?.licensePlate,
        rating: activeRiderStats.rating,
        totalRides: activeRiderStats.totalTrips,
        totalTrips: activeRiderStats.totalTrips,
        icon: activeBooking.rider?.icon,
        currentLocation: activeBooking.rider.riderProfile?.currentLocation,
      } : null,
      rideType: activeBooking.rideType ? {
        id: activeBooking.rideType.id,
        name: activeBooking.rideType.name,
        vehicleType: activeBooking.rideType.vehicleType,
        category: activeBooking.rideType.category,
        icon: activeBooking.rideType?.icon,
        waitingGraceMinutes: (activeBooking.rideType as any).waitingGraceMinutes ?? null,
        waitingPricePerMinute: (activeBooking.rideType as any).waitingPricePerMinute ?? null,
      } : null,
      
      
      bids: bookingType === 'RIDE' ? 
        (activeBooking as any).rideBids?.map((bid: any) => {
          const stats = bidRiderStatsMap.get(bid.rider.id) || { rating: 0, totalTrips: 0 }
          return {
            id: bid.id,
            bidAmount: bid.bidAmount,
            estimatedTime: bid.estimatedTime,
            message: bid.message,
            status: bid.status,
            expiresAt: toIso(bid.expiresAt),
            createdAt: toIso(bid.createdAt),
            rider: {
              id: bid.rider.id,
              name: bid.rider.name || 'Unknown Rider',
              phone: bid.rider.phone || '',
              avatar: bid.rider.avatar,
              vehicleType: bid.rider.riderProfile?.vehicleType,
              licensePlate: bid.rider.riderProfile?.licensePlate,
              rating: stats.rating,
              totalRides: stats.totalTrips,
              totalTrips: stats.totalTrips,
              icon: bid.rider?.icon,
              currentLocation: bid.rider.riderProfile?.currentLocation,
            }
          }
        }) : 
        (activeBooking as any).bids?.map((bid: any) => {
          const stats = bidRiderStatsMap.get(bid.rider.id) || { rating: 0, totalTrips: 0 }
          return {
            id: bid.id,
            bidAmount: bid.bidAmount,
            estimatedTime: bid.estimatedTime,
            message: bid.message,
            status: bid.status,
            expiresAt: toIso(bid.expiresAt),
            createdAt: toIso(bid.createdAt),
            rider: {
              id: bid.rider.id,
              name: bid.rider.name || 'Unknown Rider',
              phone: bid.rider.phone || '',
              avatar: bid.rider.avatar,
              vehicleType: bid.rider.riderProfile?.vehicleType,
              licensePlate: bid.rider.riderProfile?.licensePlate,
              rating: stats.rating,
              totalRides: stats.totalTrips,
              totalTrips: stats.totalTrips,
              icon: bid.rider?.icon,
              currentLocation: bid.rider.riderProfile?.currentLocation,
            }
          }
        }) || []
    }

    return NextResponse.json({
      success: true,
      hasActiveBooking: true,
      booking: transformedBooking
    })

  } catch (error) {
    console.error("Error fetching active booking:", error)
    return NextResponse.json({ 
      success: false,
      error: "Failed to fetch active booking" 
    }, { status: 500 })
  }
}
