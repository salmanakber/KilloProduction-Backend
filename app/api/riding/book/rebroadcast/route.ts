import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { findNearbyRidersForRideBooking } from "@/lib/riding-dispatch-waves"
import {
  getNotifiedRiderUserIds,
  getRebroadcastWaveParams,
  incrementRebroadcastCount,
  recordNotifiedRiderUserIds,
} from "@/lib/riding-rebroadcast-state"

const RETRY_BROADCAST_SECONDS = 90
const RETRY_LOCK_SECONDS = 18
const DISPATCH_WAVE_SIZE = 5
const RIDE_FIRST_WAVE_MS = 45 * 1000
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
      return NextResponse.json({ error: "Booking is not eligible for rebroadcast" }, { status: 400 })
    }

    const isRideBooking = Boolean(rideBooking)
    const booking = (rideBooking || courierBooking) as any
    const rebroadcastWave = incrementRebroadcastCount(booking.id)
    const { radiusKm, maxRiders } = getRebroadcastWaveParams(rebroadcastWave)

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

    const nearbyRiders = await findNearbyRidersForRideBooking(
      Number(booking.pickupLatitude),
      Number(booking.pickupLongitude),
      radiusKm
    )
    const alreadyNotified = getNotifiedRiderUserIds(booking.id)
    const freshRiders = (await filterRidersWithoutActiveBooking(nearbyRiders)).filter(
      (r) => !alreadyNotified.has((r as any).user.id as string)
    )
    const eligibleRiders = freshRiders.slice(0, maxRiders)

    const socketServer = getGlobalSocketServer()
    socketServer.ensureRuntimeAttached()
    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + RETRY_BROADCAST_SECONDS * 1000).toISOString()
    const rebroadcastWaveId = `${booking.id}:rebroadcast:${rebroadcastWave}:${Date.now()}`

    const dispatchWave = async (waveStart: number, waveSize = DISPATCH_WAVE_SIZE) => {
      const batch = eligibleRiders.slice(waveStart, waveStart + waveSize)
      if (!batch.length) return

      const lockUntil = new Date(Date.now() + RETRY_LOCK_SECONDS * 1000).toISOString()
      const notifiedIds: string[] = []

      for (const rider of batch) {
        const riderUserId = (rider as any).user.id as string
        const riderData = buildRiderPayload({
          booking,
          user,
          isRideBooking,
          rider,
          createdAt,
          expiresAt,
          lockUntil,
          rebroadcastWaveId,
          rebroadcastWave,
          waveIndex: Math.floor(waveStart / DISPATCH_WAVE_SIZE),
        })

        await socketServer.sendNewRideToUser(riderUserId, riderData)
        notifiedIds.push(riderUserId)
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

      if (notifiedIds.length) {
        recordNotifiedRiderUserIds(booking.id, notifiedIds)
      }
    }

    await dispatchWave(0, DISPATCH_WAVE_SIZE)
    if (eligibleRiders.length > DISPATCH_WAVE_SIZE) {
      setTimeout(() => {
        void dispatchWave(DISPATCH_WAVE_SIZE, DISPATCH_WAVE_SIZE)
      }, RIDE_FIRST_WAVE_MS)
    }
    if (eligibleRiders.length > DISPATCH_WAVE_SIZE * 2) {
      setTimeout(() => {
        void dispatchWave(DISPATCH_WAVE_SIZE * 2, DISPATCH_WAVE_SIZE)
      }, RIDE_FIRST_WAVE_MS * 2)
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
            rebroadcastWaveId,
          })
        }

        await socketServer.sendNotificationToUser(user.id, {
          type: "request_status_change",
          requestId: booking.id,
          newStatus: "BROADCAST_ENDED",
          message: "Still no rider accepted. You can broadcast again to reach more riders.",
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
        rebroadcastWave,
        searchRadiusKm: radiusKm,
        maxRiders,
        expiresAt,
      },
    })
  } catch (error) {
    console.error("Ride rebroadcast error:", error)
    return NextResponse.json({ error: "Failed to rebroadcast ride request" }, { status: 500 })
  }
}

function buildRiderPayload(params: {
  booking: any
  user: any
  isRideBooking: boolean
  rider: any
  createdAt: string
  expiresAt: string
  lockUntil: string
  rebroadcastWaveId: string
  rebroadcastWave: number
  waveIndex: number
}) {
  const { booking, user, isRideBooking } = params
  return {
    bookingId: booking.id,
    riderId: params.rider.id,
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
      isRideBooking ? (booking.estimatedFare || booking.finalFare || 0) : (booking.fare || 0)
    ),
    fare: Number(
      isRideBooking ? (booking.finalFare || booking.estimatedFare || 0) : (booking.fare || 0)
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
    createdAt: params.createdAt,
    expiresAt: params.expiresAt,
    dispatchLockSeconds: RETRY_LOCK_SECONDS,
    lockUntil: params.lockUntil,
    waveIndex: params.waveIndex,
    rebroadcast: true,
    rebroadcastWave: params.rebroadcastWave,
    rebroadcastWaveId: params.rebroadcastWaveId,
  }
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
