import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import type { CourierStatus, RideStatus } from "@prisma/client"

export type EmergencyContactItem = {
  id: string
  name: string
  number: string
  icon?: string
}

export const DEFAULT_RIDING_EMERGENCY_CONTACTS: EmergencyContactItem[] = [
  { id: "police", name: "Police", number: "199", icon: "call" },
  { id: "ambulance", name: "Ambulance", number: "199", icon: "medical" },
  { id: "fire", name: "Fire Service", number: "199", icon: "flame" },
]

const ACTIVE_RIDE_STATUSES: RideStatus[] = [
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

const ACTIVE_COURIER_STATUSES: CourierStatus[] = [
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

const SHARE_TTL_HOURS = 24

export function getPublicAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.MOBILE_APP_URL ||
    "https://kilo1app.com"
  return raw.replace(/\/+$/, "")
}

export function buildTripShareUrl(token: string): string {
  return `${getPublicAppBaseUrl()}/track/${encodeURIComponent(token)}`
}

export function buildTripShareDeepLink(token: string): string {
  return `kilosuperappv1://track/${encodeURIComponent(token)}`
}

export async function getRidingEmergencyContacts(): Promise<EmergencyContactItem[]> {
  const row = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { compnyinfo: true },
  })
  const raw = (row?.compnyinfo as { ridingEmergencyContacts?: unknown })?.ridingEmergencyContacts
  if (!Array.isArray(raw)) return DEFAULT_RIDING_EMERGENCY_CONTACTS
  const list = raw
    .map((item: any, index: number) => ({
      id: String(item?.id || `contact-${index}`),
      name: String(item?.name || "").trim(),
      number: String(item?.number || "").trim(),
      icon: item?.icon ? String(item.icon) : "call",
    }))
    .filter((c) => c.name && c.number)
  return list.length > 0 ? list : DEFAULT_RIDING_EMERGENCY_CONTACTS
}

function generateShareToken(): string {
  return crypto.randomBytes(24).toString("base64url")
}

async function loadBookingForShare(bookingId: string, customerId: string) {
  const [ride, courier] = await Promise.all([
    prisma.rideBooking.findFirst({
      where: { id: bookingId, customerId },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
            riderProfile: {
              select: {
                vehicleType: true,
                licensePlate: true,
                currentLocation: true,
              },
            },
          },
        },
        rideType: { select: { name: true, vehicleType: true } },
      },
    }),
    prisma.courierBooking.findFirst({
      where: { id: bookingId, customerId },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
            riderProfile: {
              select: {
                vehicleType: true,
                licensePlate: true,
                currentLocation: true,
              },
            },
          },
        },
      },
    }),
  ])
  if (ride) return { booking: ride, bookingType: "RIDE" as const }
  if (courier) return { booking: courier, bookingType: "COURIER" as const }
  return null
}

function isBookingTrackable(status: string, bookingType: "RIDE" | "COURIER"): boolean {
  const s = String(status || "").toUpperCase()
  if (bookingType === "RIDE") {
    return ACTIVE_RIDE_STATUSES.includes(s as RideStatus)
  }
  return ACTIVE_COURIER_STATUSES.includes(s as CourierStatus)
}

export async function createTripShareLink(customerId: string, bookingId: string) {
  const loaded = await loadBookingForShare(bookingId, customerId)
  if (!loaded) {
    throw new Error("BOOKING_NOT_FOUND")
  }
  const { booking, bookingType } = loaded
  if (!isBookingTrackable(booking.status, bookingType)) {
    throw new Error("BOOKING_NOT_ACTIVE")
  }

  const token = generateShareToken()
  const expiresAt = new Date(Date.now() + SHARE_TTL_HOURS * 60 * 60 * 1000)

  await prisma.rideTripShareToken.create({
    data: {
      token,
      bookingId: booking.id,
      bookingType,
      customerId,
      expiresAt,
    },
  })

  return {
    token,
    shareUrl: buildTripShareUrl(token),
    deepLink: buildTripShareDeepLink(token),
    expiresAt: expiresAt.toISOString(),
  }
}

export async function resolveShareToken(token: string) {
  const row = await prisma.rideTripShareToken.findUnique({
    where: { token },
  })
  if (!row || row.revokedAt) return null
  if (row.expiresAt.getTime() < Date.now()) return null
  return row
}

export function mapBookingToSharePayload(
  booking: any,
  bookingType: "RIDE" | "COURIER",
  extra?: { riderLat?: number; riderLng?: number; riderHeading?: number | null },
) {
  const rider = booking?.rider
  const profile = rider?.riderProfile
  const loc = profile?.currentLocation as { latitude?: number; longitude?: number; heading?: number } | null
  const riderLat = extra?.riderLat ?? (typeof loc?.latitude === "number" ? loc.latitude : null)
  const riderLng = extra?.riderLng ?? (typeof loc?.longitude === "number" ? loc.longitude : null)
  const riderHeading =
    extra?.riderHeading ?? (typeof loc?.heading === "number" ? loc.heading : null)

  return {
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber || booking.id,
    bookingType,
    status: booking.status,
    pickupAddress: booking.pickupAddress || "",
    dropAddress: booking.dropAddress || "",
    pickupLatitude: Number(booking.pickupLatitude),
    pickupLongitude: Number(booking.pickupLongitude),
    dropLatitude: Number(booking.dropLatitude),
    dropLongitude: Number(booking.dropLongitude),
    rider: rider
      ? {
          name: rider.name || "Driver",
          phone: rider.phone || null,
          vehicleType: profile?.vehicleType || booking.rideType?.vehicleType || null,
          licensePlate: profile?.licensePlate || null,
        }
      : null,
    riderLocation:
      riderLat != null && riderLng != null
        ? {
            latitude: riderLat,
            longitude: riderLng,
            heading: riderHeading,
            updatedAt: new Date().toISOString(),
          }
        : null,
    isActive: isBookingTrackable(booking.status, bookingType),
    updatedAt: new Date().toISOString(),
  }
}

export async function getTripShareSnapshotByToken(token: string) {
  const share = await resolveShareToken(token)
  if (!share) return null

  const loaded = await loadBookingForShare(share.bookingId, share.customerId)
  if (!loaded) {
    await prisma.rideTripShareToken.update({
      where: { id: share.id },
      data: { revokedAt: new Date() },
    })
    return null
  }

  const { booking, bookingType } = loaded
  const payload = mapBookingToSharePayload(booking, bookingType)

  if (!payload.isActive) {
    await prisma.rideTripShareToken.update({
      where: { id: share.id },
      data: { revokedAt: new Date() },
    })
  }

  return {
    token: share.token,
    expiresAt: share.expiresAt.toISOString(),
    trip: payload,
  }
}

export function tripShareRoom(bookingId: string): string {
  return `trip_share:${bookingId}`
}
