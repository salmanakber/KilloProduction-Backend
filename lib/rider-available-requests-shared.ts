import type { VehicleType } from "@prisma/client"
import {
  buildRiderServiceFilter,
  courierMatchesRider,
  rideBookingMatchesRider,
  type RiderServiceFilter,
} from "@/lib/rider-request-eligibility"

export const RIDE_BROADCAST_TTL_MS = 90 * 1000
export const NON_RIDE_BROADCAST_TTL_MS = 90 * 60 * 1000
export const DEFAULT_BID_CAP_PERCENT = 20

export function getBidCapPercent(): number {
  const raw = Number(process.env.RIDING_BID_CAP_PERCENT ?? DEFAULT_BID_CAP_PERCENT)
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_BID_CAP_PERCENT
  return raw
}

export function calculateMaxBidCapAmount(estimatedFare: number): number {
  const capPercent = getBidCapPercent()
  const capped = estimatedFare * (1 + capPercent / 100)
  return Math.round(capped * 100) / 100
}

/** Listing stays visible until broadcast ends or the last active PENDING bid expires. */
export function computeRequestListingExpiresMs(params: {
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

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function isScheduledRequestVisible(scheduledAt: Date | string | null | undefined): boolean {
  if (!scheduledAt) return true
  const ts = new Date(scheduledAt).getTime()
  return Number.isFinite(ts) && ts <= Date.now()
}

export function isRequestListingExpired(
  expiresAt: Date | string | null | undefined,
  nowTs = Date.now()
): boolean {
  if (!expiresAt) return false
  const ts = new Date(expiresAt).getTime()
  return Number.isFinite(ts) && nowTs >= ts
}

export function riderWithinPickupRangeKm(
  riderLat: number,
  riderLng: number,
  pickupLat: number,
  pickupLng: number,
  maxDeliveryDistanceKm: number
): boolean {
  if (!Number.isFinite(riderLat) || !Number.isFinite(riderLng)) return false
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) return false
  const maxKm = maxDeliveryDistanceKm > 0 ? maxDeliveryDistanceKm : 10
  const distanceKm = haversineKm(riderLat, riderLng, pickupLat, pickupLng)
  return distanceKm <= maxKm
}

export function requestMatchesRiderFilter(
  filter: RiderServiceFilter,
  request: {
    type?: string | null
    module?: string | null
    rideTypeVehicle?: VehicleType | string | null
  }
): boolean {
  const vehicle = String(request.rideTypeVehicle || "").toUpperCase() as VehicleType
  if (!vehicle) return false
  const type = String(request.type || "courier").toLowerCase()
  if (type === "ride") {
    return rideBookingMatchesRider(filter, vehicle)
  }
  return courierMatchesRider(filter, request.module ?? null, vehicle)
}

export function extractRequestVehicleType(payload: Record<string, unknown>): string | null {
  const rideType = payload.rideType as { vehicleType?: unknown } | undefined
  const raw =
    rideType?.vehicleType ??
    payload.vehicleType ??
    payload.requestedVehicleType
  if (typeof raw !== "string") return null
  const normalized = raw.trim().toUpperCase()
  return normalized || null
}

export function extractRequestType(payload: Record<string, unknown>): "ride" | "courier" {
  const raw = payload.type ?? payload.requestType
  return String(raw || "courier").toLowerCase() === "ride" ? "ride" : "courier"
}

export function shouldBroadcastRequestToRider(
  riderFilter: RiderServiceFilter,
  riderLat: number | null | undefined,
  riderLng: number | null | undefined,
  maxDeliveryDistanceKm: number,
  request: {
    pickupLatitude: number
    pickupLongitude: number
    type: "ride" | "courier"
    module?: string | null
    rideTypeVehicle: string
    scheduledAt?: Date | string | null
    expiresAt?: Date | string | null
    status?: string | null
  }
): boolean {
  const status = String(request.status || "REQUESTED").toUpperCase()
  if (!["REQUESTED", "BIDDING"].includes(status)) return false
  if (!isScheduledRequestVisible(request.scheduledAt)) return false
  if (isRequestListingExpired(request.expiresAt)) return false
  if (!requestMatchesRiderFilter(riderFilter, request)) return false
  if (riderLat == null || riderLng == null) return false
  return riderWithinPickupRangeKm(
    riderLat,
    riderLng,
    request.pickupLatitude,
    request.pickupLongitude,
    maxDeliveryDistanceKm
  )
}
