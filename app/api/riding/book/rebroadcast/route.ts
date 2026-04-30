import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"

const RETRY_BROADCAST_SECONDS = 90
const RETRY_RADIUS_KM = 20
const RETRY_TARGET_MAX_RIDERS = 10
const RETRY_LOCK_SECONDS = 18
const RIDER_ACTIVE_BOOKING_STATUSES = [
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_AT_DROPOFF",
] as const

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const bookingId = String(body?.bookingId || "")
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 })
    }

    const rideBooking = await prisma.rideBooking.findFirst({
      where: {
        id: bookingId,
        customerId: user.id,
        status: { in: ["REQUESTED", "BIDDING", "EXPIRED"] as any },
      },
      include: { rideType: true },
    })

    const courierBooking = !rideBooking
      ? await prisma.courierBooking.findFirst({
          where: {
            id: bookingId,
            customerId: user.id,
            status: { in: ["REQUESTED", "BIDDING", "EXPIRED"] as any },
          },
          include: { rideType: true },
        })
      : null

    if (!rideBooking && !courierBooking) {
      console.log("Booking is not eligible for rebroadcast", bookingId)
      return NextResponse.json({ error: "Booking is not eligible for rebroadcast" }, { status: 400 })
    }

    const isRideBooking = Boolean(rideBooking)
    const booking = (rideBooking || courierBooking) as any

    if (isRideBooking) {
      await prisma.rideBooking.update({
        where: { id: booking.id },
        data: {
          status: "REQUESTED" as any,
          requestedAt: new Date(),
          
        },
      })
    } else {
      await prisma.courierBooking.update({
        where: { id: booking.id },
        data: {
          status: "REQUESTED" as any,
          createdAt: new Date(),
          

        },
      })
    }

    const nearbyRiders = await findNearbyRiders(
      Number(booking.pickupLatitude),
      Number(booking.pickupLongitude),
      RETRY_RADIUS_KM
    )
    const eligibleRiders = (await filterRidersWithoutActiveBooking(nearbyRiders)).slice(0, RETRY_TARGET_MAX_RIDERS)

    const socketServer = getGlobalSocketServer()
    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + RETRY_BROADCAST_SECONDS * 1000).toISOString()
    const lockUntil = new Date(Date.now() + RETRY_LOCK_SECONDS * 1000).toISOString()

    for (const rider of eligibleRiders) {
      const riderUserId = (rider as any).user.id as string
      const riderData = {
        bookingId: booking.id,
        riderId: rider.id,
        bookingType: isRideBooking ? "RIDE" : "COURIER",
        type: isRideBooking ? "ride" : "courier",
        status: "REQUESTED",
        pickup: {
          lat: Number(booking.pickupLatitude),
          lng: Number(booking.pickupLongitude),
          address: booking.pickupAddress,
        },
        dropoff: {
          lat: Number(booking.dropLatitude),
          lng: Number(booking.dropLongitude),
          address: booking.dropAddress,
        },
        pickupLatitude: Number(booking.pickupLatitude),
        pickupLongitude: Number(booking.pickupLongitude),
        dropLatitude: Number(booking.dropLatitude),
        dropLongitude: Number(booking.dropLongitude),
        pickupAddress: booking.pickupAddress,
        dropAddress: booking.dropAddress,
        estimatedFare: Number(
          isRideBooking
            ? (booking.estimatedFare || booking.finalFare || 0)
            : (booking.fare || 0)
        ),
        fare: Number(
          isRideBooking
            ? (booking.finalFare || booking.estimatedFare || 0)
            : (booking.fare || 0)
        ),
        distanceKm: Number(booking.distance || 0),
        distance: Number(booking.distance || 0),
        estimatedArrivalMinutes: Number(booking.estimatedTime || 0),
        estimatedTime: Number(booking.estimatedTime || 0),
        customerName: booking.customerName || user.name || "Customer",
        customerPhone: booking.customerPhone || user.phone || null,
        rideType: booking.rideType?.name || "Ride",
        vehicleType: booking.rideType?.vehicleType || "CAR",
        passengerCount: Number(booking.passengerCount || 1),
        specialRequests: booking.specialRequests,
        createdAt,
        expiresAt,
        dispatchLockSeconds: RETRY_LOCK_SECONDS,
        lockUntil,
        waveIndex: 0,
        rebroadcast: true,
      }

      await socketServer.sendNewRideToUser(riderUserId, riderData)
      await NotificationBridge.sendNotification({
        userId: riderUserId,
        title: isRideBooking ? "Ride Request (Expanded Search)" : "Delivery Request (Expanded Search)",
        message: `New ${isRideBooking ? "ride" : "delivery"} request from ${riderData.customerName}. Distance: ${riderData.distanceKm.toFixed(1)}km, Fare: ${Math.round(riderData.fare)}`,
        type: isRideBooking ? "RIDE" : "DELIVERY",
        module: "RIDING",
        data: riderData,
        actionUrl: "AvailableRides",
      })
    }

    setTimeout(async () => {
      try {
        const stillPending = isRideBooking
          ? await prisma.rideBooking.findUnique({
              where: { id: booking.id },
              select: { status: true },
            })
          : await prisma.courierBooking.findUnique({
              where: { id: booking.id },
              select: { status: true },
            })
        if (!stillPending || !["REQUESTED", "BIDDING"].includes(String(stillPending.status))) return

        for (const rider of eligibleRiders) {
          const riderUserId = (rider as any).user.id as string
          await socketServer.sendNotificationToUser(riderUserId, {
            type: "request_removed",
            requestId: booking.id,
            reason: "BROADCAST_WINDOW_ENDED",
          })
        }

        await socketServer.sendNotificationToUser(user.id, {
          type: "request_status_change",
          requestId: booking.id,
          newStatus: "BROADCAST_ENDED",
          message: "Still no rider accepted. You can broadcast again.",
        })
      } catch (error) {
        console.error("Rebroadcast expiry error:", error)
      }
    }, RETRY_BROADCAST_SECONDS * 1000)

    return NextResponse.json({
      success: true,
      data: {
        bookingId: booking.id,
        targetedRiders: eligibleRiders.length,
        expiresAt,
      },
    })
  } catch (error) {
    console.error("Ride rebroadcast error:", error)
    return NextResponse.json({ error: "Failed to rebroadcast ride request" }, { status: 500 })
  }
}

async function findNearbyRiders(latitude: number, longitude: number, radiusKm: number) {
  const riders = await prisma.riderProfile.findMany({
    where: {
      isAvailable: true,
      user: { isActive: true, isVerified: true },
    },
    include: {
      user: {
        select: { id: true, name: true, phone: true, email: true },
      },
    },
  })

  const nearbyRiders = riders.filter((rider) => {
    if (!rider.currentLocation) return false
    const location = rider.currentLocation as any
    if (!location.latitude || !location.longitude) return false
    const distance = calculateDistance(latitude, longitude, location.latitude, location.longitude)
    return distance <= radiusKm
  })

  return nearbyRiders.sort((a, b) => {
    const locationA = a.currentLocation as any
    const locationB = b.currentLocation as any
    const distanceA = calculateDistance(latitude, longitude, locationA.latitude, locationA.longitude)
    const distanceB = calculateDistance(latitude, longitude, locationB.latitude, locationB.longitude)
    return distanceA - distanceB
  })
}

async function filterRidersWithoutActiveBooking(riders: any[]) {
  const riderUserIds = riders.map((r) => (r as any).user.id as string)
  if (!riderUserIds.length) return riders
  const [activeRides, activeCourier] = await Promise.all([
    prisma.rideBooking.findMany({
      where: {
        riderId: { in: riderUserIds },
        status: { in: RIDER_ACTIVE_BOOKING_STATUSES as any },
      },
      select: { riderId: true },
    }),
    prisma.courierBooking.findMany({
      where: {
        riderId: { in: riderUserIds },
        status: { in: RIDER_ACTIVE_BOOKING_STATUSES as any },
      },
      select: { riderId: true },
    }),
  ])
  const blockedRiders = new Set(
    [...activeRides, ...activeCourier].map((b) => b.riderId).filter((id): id is string => Boolean(id))
  )
  return riders.filter((r) => !blockedRiders.has((r as any).user.id))
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
