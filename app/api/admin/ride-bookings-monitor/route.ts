import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { getGoogleMapsRuntimeConfig } from "@/lib/google-maps"
import { prisma } from "@/lib/prisma"
import { CourierStatus, RideStatus } from "@prisma/client"

const LIVE_RIDE_STATUSES: RideStatus[] = [
  "REQUESTED",
  "BIDDING",
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_AT_DROPOFF",
]

const LIVE_COURIER_STATUSES: CourierStatus[] = [
  "REQUESTED",
  "BIDDING",
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "AWAITING_PREP",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_AT_DROPOFF",
]

const TERMINAL_RIDE: RideStatus[] = ["COMPLETED", "DELIVERED", "CANCELLED", "WITHDRAWN", "EXPIRED"]
const TERMINAL_COURIER: CourierStatus[] = ["COMPLETED", "DELIVERED", "CANCELLED", "WITHDRAWN", "EXPIRED"]

function parseRiderLocation(raw: unknown): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const lat = Number(o.latitude ?? o.lat)
  const lng = Number(o.longitude ?? o.lng ?? o.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticateRequest(request)
    if (!actor?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const type = (searchParams.get("type") || "ALL").toUpperCase()
    const group = (searchParams.get("group") || "live").toLowerCase()
    const search = (searchParams.get("search") || "").trim()
    const limit = Math.min(200, Math.max(20, Number(searchParams.get("limit") || 80)))

    const rideStatusFilter =
      group === "live"
        ? { in: LIVE_RIDE_STATUSES }
        : group === "completed"
          ? { in: TERMINAL_RIDE }
          : undefined

    const courierStatusFilter =
      group === "live"
        ? { in: LIVE_COURIER_STATUSES }
        : group === "completed"
          ? { in: TERMINAL_COURIER }
          : undefined

    const searchOr = search
      ? {
          OR: [
            { bookingNumber: { contains: search, mode: "insensitive" as const } },
            { pickupAddress: { contains: search, mode: "insensitive" as const } },
            { dropAddress: { contains: search, mode: "insensitive" as const } },
            { customer: { name: { contains: search, mode: "insensitive" as const } } },
            { customer: { phone: { contains: search, mode: "insensitive" as const } } },
            { rider: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}

    const [rides, couriers, mapsConfig, systemSettings, defaultCurrencyRow] = await Promise.all([
      type === "COURIER"
        ? Promise.resolve([])
        : prisma.rideBooking.findMany({
            where: {
              ...(rideStatusFilter ? { status: rideStatusFilter } : {}),
              ...searchOr,
            },
            orderBy: { updatedAt: "desc" },
            take: limit,
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  avatar: true,
                  userProfile: { select: { firstName: true, lastName: true } },
                },
              },
              rider: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  avatar: true,
                  riderProfile: {
                    select: {
                      vehicleType: true,
                      licensePlate: true,
                      currentLocation: true,
                      lastLocationUpdate: true,
                    },
                  },
                },
              },
              rideType: { select: { id: true, name: true, vehicleType: true, icon: true } },
            },
          }),
      type === "RIDE"
        ? Promise.resolve([])
        : prisma.courierBooking.findMany({
            where: {
              ...(courierStatusFilter ? { status: courierStatusFilter } : {}),
              ...searchOr,
            },
            orderBy: { updatedAt: "desc" },
            take: limit,
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  avatar: true,
                  userProfile: { select: { firstName: true, lastName: true } },
                },
              },
              rider: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  avatar: true,
                  riderProfile: {
                    select: {
                      vehicleType: true,
                      licensePlate: true,
                      currentLocation: true,
                      lastLocationUpdate: true,
                    },
                  },
                },
              },
              rideType: { select: { id: true, name: true, vehicleType: true, icon: true } },
            },
          }),
      getGoogleMapsRuntimeConfig(),
      prisma.systemSettings.findUnique({
        where: { id: 1 },
        select: { defaultCurrency: true, currency: true },
      }),
      prisma.currency.findFirst({
        where: { isDefault: true },
        select: { code: true, symbol: true },
      }),
    ])

    const currencyCode =
      systemSettings?.defaultCurrency ||
      systemSettings?.currency ||
      defaultCurrencyRow?.code ||
      "NGN"
    const currencySymbol = defaultCurrencyRow?.symbol || currencyCode

    const rideIds = rides.map((r) => r.id)
    const courierIds = couriers.map((c) => c.id)
    const allIds = [...rideIds, ...courierIds]

    const [rideTracking, courierTracking, activeSos] = await Promise.all([
      rideIds.length
        ? prisma.rideTracking.findMany({
            where: { rideBookingId: { in: rideIds } },
            orderBy: { timestamp: "desc" },
            distinct: ["rideBookingId"],
          })
        : Promise.resolve([]),
      courierIds.length
        ? prisma.courierTracking.findMany({
            where: { bookingId: { in: courierIds } },
            orderBy: { timestamp: "desc" },
            distinct: ["bookingId"],
          })
        : Promise.resolve([]),
      allIds.length
        ? prisma.sOSAlert.findMany({
            where: { bookingId: { in: allIds }, status: "ACTIVE" },
            select: { bookingId: true, id: true, timestamp: true },
          })
        : Promise.resolve([]),
    ])

    const rideTrackMap = new Map(rideTracking.map((t) => [t.rideBookingId, t]))
    const courierTrackMap = new Map(courierTracking.map((t) => [t.bookingId, t]))
    const sosMap = new Map(activeSos.map((s) => [s.bookingId, s]))

    const formatCustomerName = (c: {
      name: string | null
      userProfile?: { firstName: string | null; lastName: string | null } | null
    }) => {
      const fn = c.userProfile?.firstName
      const ln = c.userProfile?.lastName
      if (fn || ln) return [fn, ln].filter(Boolean).join(" ")
      return c.name || "Customer"
    }

    const mapRide = (b: (typeof rides)[0]) => {
      const track = rideTrackMap.get(b.id)
      const riderLoc = parseRiderLocation(b.rider?.riderProfile?.currentLocation)
      const lastPoint =
        track?.latitude != null && track?.longitude != null
          ? { lat: track.latitude, lng: track.longitude, at: track.timestamp, heading: track.heading }
          : riderLoc
            ? {
                lat: riderLoc.lat,
                lng: riderLoc.lng,
                at: b.rider?.riderProfile?.lastLocationUpdate || b.updatedAt,
              }
            : null

      return {
        id: b.id,
        bookingNumber: b.bookingNumber,
        type: "RIDE" as const,
        module: "RIDE",
        status: b.status,
        paymentStatus: b.paymentStatus,
        fare: b.finalFare ?? b.estimatedFare,
        distance: b.distance,
        estimatedTime: b.estimatedTime,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        scheduledAt: b.scheduledAt?.toISOString() ?? null,
        customer: {
          id: b.customer.id,
          name: formatCustomerName(b.customer),
          phone: b.customer.phone,
          avatar: b.customer.avatar,
        },
        rider: b.rider
          ? {
              id: b.rider.id,
              name: b.rider.name,
              phone: b.rider.phone,
              vehicleType: b.rider.riderProfile?.vehicleType,
              licensePlate: b.rider.riderProfile?.licensePlate,
            }
          : null,
        rideType: b.rideType,
        pickup: {
          address: b.pickupAddress,
          lat: b.pickupLatitude,
          lng: b.pickupLongitude,
        },
        drop: {
          address: b.dropAddress,
          lat: b.dropLatitude,
          lng: b.dropLongitude,
        },
        lastLocation: lastPoint,
        hasActiveSos: sosMap.has(b.id),
        sosId: sosMap.get(b.id)?.id ?? null,
      }
    }

    const mapCourier = (b: (typeof couriers)[0]) => {
      const track = courierTrackMap.get(b.id)
      const riderLoc = parseRiderLocation(b.rider?.riderProfile?.currentLocation)
      const lastPoint =
        track?.latitude != null && track?.longitude != null
          ? { lat: track.latitude, lng: track.longitude, at: track.timestamp }
          : riderLoc
            ? {
                lat: riderLoc.lat,
                lng: riderLoc.lng,
                at: b.rider?.riderProfile?.lastLocationUpdate || b.updatedAt,
              }
            : null

      return {
        id: b.id,
        bookingNumber: b.bookingNumber,
        type: "COURIER" as const,
        module: b.module || "COURIER",
        status: b.status,
        paymentStatus: b.paymentStatus,
        fare: b.fare,
        distance: b.distance,
        estimatedTime: b.estimatedTime,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        scheduledAt: b.scheduledAt?.toISOString() ?? null,
        customer: {
          id: b.customer.id,
          name: formatCustomerName(b.customer),
          phone: b.customer.phone,
          avatar: b.customer.avatar,
        },
        rider: b.rider
          ? {
              id: b.rider.id,
              name: b.rider.name,
              phone: b.rider.phone,
              vehicleType: b.rider.riderProfile?.vehicleType,
              licensePlate: b.rider.riderProfile?.licensePlate,
            }
          : null,
        rideType: b.rideType,
        pickup: {
          address: b.pickupAddress,
          lat: b.pickupLatitude,
          lng: b.pickupLongitude,
        },
        drop: {
          address: b.dropAddress,
          lat: b.dropLatitude,
          lng: b.dropLongitude,
        },
        lastLocation: lastPoint,
        hasActiveSos: sosMap.has(b.id),
        sosId: sosMap.get(b.id)?.id ?? null,
      }
    }

    const bookings = [...rides.map(mapRide), ...couriers.map(mapCourier)].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )

    const isLiveBooking = (b: { type: string; status: string }) =>
      b.type === "RIDE"
        ? LIVE_RIDE_STATUSES.includes(b.status as RideStatus)
        : LIVE_COURIER_STATUSES.includes(b.status as CourierStatus)

    const stats = {
      total: bookings.length,
      live: bookings.filter(isLiveBooking).length,
      withRider: bookings.filter((b) => b.rider).length,
      activeSos: bookings.filter((b) => b.hasActiveSos).length,
      rideCount: bookings.filter((b) => b.type === "RIDE").length,
      courierCount: bookings.filter((b) => b.type === "COURIER").length,
    }

    return NextResponse.json({
      success: true,
      bookings,
      stats,
      maps: {
        configured: Boolean(mapsConfig.apiKey),
        apiKey: mapsConfig.apiKey || null,
      },
      currency: {
        code: currencyCode,
        symbol: currencySymbol,
      },
    })
  } catch (error) {
    console.error("ride-bookings-monitor error:", error)
    return NextResponse.json({ error: "Failed to load bookings" }, { status: 500 })
  }
}
