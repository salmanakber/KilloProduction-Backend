import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { recordNotifiedRiderUserIds } from "@/lib/riding-rebroadcast-state"

const RIDE_REQUEST_MAX_AGE_MS = 90 * 1000
const NON_RIDE_REQUEST_MAX_AGE_MS = 90 * 60 * 1000
const DISPATCH_LOCK_SECONDS = 18
const DISPATCH_WAVE_SIZE = 5
const RIDE_FIRST_WAVE_MS = 45 * 1000
const dispatchTimers = new Map<string, NodeJS.Timeout[]>()
const ACTIVE_ASSIGNABLE_STATUSES = ["REQUESTED", "BIDDING"] as const
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

type SocketServer = ReturnType<typeof getGlobalSocketServer>

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/** Same query as ride booking flow: available riders within `radiusKm`, sorted. */
export async function findNearbyRidersForRideBooking(
  latitude: number,
  longitude: number,
  radiusKm: number
) {
  try {
    const riders = await prisma.riderProfile.findMany({
      where: {
        isAvailable: true,
        user: {
          isActive: true,
          isVerified: true,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    })

    const nearbyRiders = riders.filter((rider) => {
      if (!rider.currentLocation) return false
      const location = rider.currentLocation as { latitude?: number; longitude?: number }
      if (!location.latitude || !location.longitude) return false
      const distance = calculateDistance(latitude, longitude, location.latitude, location.longitude)
      return distance <= radiusKm
    })

    return nearbyRiders.sort((a, b) => {
      const locationA = a.currentLocation as { latitude: number; longitude: number }
      const locationB = b.currentLocation as { latitude: number; longitude: number }
      const distanceA = calculateDistance(latitude, longitude, locationA.latitude, locationA.longitude)
      const distanceB = calculateDistance(latitude, longitude, locationB.latitude, locationB.longitude)
      const scoreA = distanceA - a.completionRate * 0.05 + a.cancellationRate * 0.03 - a.rating * 0.02
      const scoreB = distanceB - b.completionRate * 0.05 + b.cancellationRate * 0.03 - b.rating * 0.02
      return scoreA - scoreB
    })
  } catch (error) {
    console.error("Error finding nearby riders:", error)
    return []
  }
}

export async function dispatchBookingInWaves(params: {
  bookingId: string
  bookingType: "RIDE" | "COURIER"
  bookingModule?: string | null
  customerId: string
  customerName: string
  customerPhone: string | null
  nearbyRiders: any[]
  pickupLatitude: number
  pickupLongitude: number
  pickupAddress: string
  dropLatitude: number
  dropLongitude: number
  dropAddress: string
  fare: number
  distanceKm: number
  estimatedArrivalMinutes: number
  rideTypeName: string
  vehicleType: string
  passengerCount: number
  specialRequests?: string | null
  packageType?: string | null
  packageWeight?: number | null
  isFragile?: boolean
  recipientName?: string | null
  recipientPhone?: string | null
  scheduledAt?: string | null
  socketServer: SocketServer
}) {
  const isRideTimedRequest =
    params.bookingType === "RIDE" ||
    String(params.bookingModule || "").toUpperCase() === "RIDE" ||
    String(params.bookingModule || "").toUpperCase() === "RIDING"
  const maxAgeMs = isRideTimedRequest ? RIDE_REQUEST_MAX_AGE_MS : NON_RIDE_REQUEST_MAX_AGE_MS
  const expiresAt = new Date(Date.now() + maxAgeMs).toISOString()
  const createdAt = new Date().toISOString()
  const bookingKey = `${params.bookingType}:${params.bookingId}`
  const ridersWithoutActiveBooking = await filterRidersWithoutActiveBooking(params.nearbyRiders)
  const timers: NodeJS.Timeout[] = []
  dispatchTimers.set(bookingKey, timers)

  const runWave = async (waveStart: number, waveSize = DISPATCH_WAVE_SIZE) => {
    const stillPending = await isBookingStillPending(params.bookingId, params.bookingType)
    if (!stillPending) {
      clearDispatchTimers(bookingKey)
      return
    }

    const batch = ridersWithoutActiveBooking.slice(waveStart, waveStart + waveSize)
    if (!batch.length) return

    const lockUntil = new Date(Date.now() + DISPATCH_LOCK_SECONDS * 1000).toISOString()
    const notifiedThisWave: string[] = []
    for (const rider of batch) {
      const riderUserId = (rider as any).user.id as string
      const riderData = {
        bookingId: params.bookingId,
        riderId: rider.id,
        bookingType: params.bookingType,
        type: params.bookingType === "RIDE" ? "ride" : "courier",
        status: "REQUESTED",
        pickup: { lat: params.pickupLatitude, lng: params.pickupLongitude, address: params.pickupAddress },
        dropoff: { lat: params.dropLatitude, lng: params.dropLongitude, address: params.dropAddress },
        pickupLatitude: params.pickupLatitude,
        pickupLongitude: params.pickupLongitude,
        dropLatitude: params.dropLatitude,
        dropLongitude: params.dropLongitude,
        pickupAddress: params.pickupAddress,
        dropAddress: params.dropAddress,
        estimatedFare: params.fare,
        fare: params.fare,
        distanceKm: params.distanceKm,
        distance: params.distanceKm,
        estimatedArrivalMinutes: params.estimatedArrivalMinutes,
        estimatedTime: params.estimatedArrivalMinutes,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        rideType: params.rideTypeName,
        vehicleType: params.vehicleType,
        passengerCount: params.passengerCount,
        specialRequests: params.specialRequests,
        packageType: params.packageType,
        packageWeight: params.packageWeight,
        isFragile: params.isFragile,
        recipientName: params.recipientName,
        recipientPhone: params.recipientPhone,
        scheduledAt: params.scheduledAt,
        createdAt,
        expiresAt,
        dispatchLockSeconds: DISPATCH_LOCK_SECONDS,
        lockUntil,
        waveIndex: Math.floor(waveStart / DISPATCH_WAVE_SIZE),
      }

      await params.socketServer.sendNewRideToUser(riderUserId, riderData)
      notifiedThisWave.push(riderUserId)
      await NotificationBridge.sendNotification({
        userId: riderUserId,
        title: "New Ride Request",
        message: `New ${params.bookingType === "RIDE" ? "ride" : "delivery"} request from ${params.customerName}. Distance: ${params.distanceKm.toFixed(1)}km, Fare: ${params.fare.toFixed(0)}`,
        type: params.bookingType === "RIDE" ? "RIDE" : "DELIVERY",
        module: "RIDING",
        data: riderData,
        actionUrl: "AvailableRides",
      })
    }
    if (notifiedThisWave.length) {
      recordNotifiedRiderUserIds(params.bookingId, notifiedThisWave)
    }
  }

  await runWave(0, DISPATCH_WAVE_SIZE)

  if (isRideTimedRequest) {
    const expansionTimer = setTimeout(() => {
      void runWave(DISPATCH_WAVE_SIZE, DISPATCH_WAVE_SIZE)
    }, RIDE_FIRST_WAVE_MS)
    timers.push(expansionTimer)
  } else {
    for (let waveStart = DISPATCH_WAVE_SIZE; waveStart < ridersWithoutActiveBooking.length; waveStart += DISPATCH_WAVE_SIZE) {
      const timer = setTimeout(() => {
        void runWave(waveStart)
      }, Math.floor(waveStart / DISPATCH_WAVE_SIZE) * DISPATCH_LOCK_SECONDS * 1000)
      timers.push(timer)
    }
  }

  const expiryTimer = setTimeout(async () => {
    try {
      const stillPending = await isBookingStillPending(params.bookingId, params.bookingType)
      if (!stillPending) return

      if (params.bookingType !== "RIDE") {
        await prisma.courierBooking.update({
          where: { id: params.bookingId },
          data: { status: "EXPIRED" },
        })
      }

      for (const rider of ridersWithoutActiveBooking) {
        const riderUserId = (rider as any).user.id as string
        await params.socketServer.sendNotificationToUser(riderUserId, {
          type: "request_removed",
          requestId: params.bookingId,
          reason: params.bookingType === "RIDE" ? "BROADCAST_WINDOW_ENDED" : "EXPIRED",
        })
      }

      await params.socketServer.sendNotificationToUser(params.customerId, {
        type: "request_status_change",
        requestId: params.bookingId,
        newStatus: params.bookingType === "RIDE" ? "BROADCAST_ENDED" : "EXPIRED",
        message:
          params.bookingType === "RIDE"
            ? "No rider accepted in this round. You can broadcast again to more riders."
            : "No rider accepted your request in time. Please try again.",
      })
    } catch (error) {
      console.error("Error expiring request:", error)
    } finally {
      clearDispatchTimers(bookingKey)
    }
  }, maxAgeMs)
  timers.push(expiryTimer)
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

async function isBookingStillPending(bookingId: string, bookingType: "RIDE" | "COURIER") {
  if (bookingType === "RIDE") {
    const booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    })
    return booking
      ? ACTIVE_ASSIGNABLE_STATUSES.includes(booking.status as (typeof ACTIVE_ASSIGNABLE_STATUSES)[number])
      : false
  }

  const booking = await prisma.courierBooking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  })
  return booking
    ? ACTIVE_ASSIGNABLE_STATUSES.includes(booking.status as (typeof ACTIVE_ASSIGNABLE_STATUSES)[number])
    : false
}

function clearDispatchTimers(bookingKey: string) {
  const timers = dispatchTimers.get(bookingKey)
  if (!timers) return
  for (const timer of timers) clearTimeout(timer)
  dispatchTimers.delete(bookingKey)
}
