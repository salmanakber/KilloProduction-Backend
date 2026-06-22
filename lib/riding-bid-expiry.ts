import { prisma } from "@/lib/prisma"

/** Matches customer active-booking broadcast window (seconds). */
export const RIDE_BROADCAST_WINDOW_SEC = 90

/** Default rider bid TTL when request window still allows it (ms). */
export const DEFAULT_RIDING_BID_TTL_MS = 8 * 1000

/** Seconds before broadcast ends when counter-offers are disabled (base accept only). */
export const DEFAULT_RIDING_BID_CUTOFF_SEC = 8

/** Courier non–ride-like listing TTL (matches available-requests). */
export const COURIER_NON_RIDE_BROADCAST_MS = 90 * 60 * 1000

function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function ridingBidTtlMs(): number {
  return numEnv("RIDING_BID_TTL_MS", DEFAULT_RIDING_BID_TTL_MS)
}

export function rideBroadcastWindowMs(): number {
  return numEnv("RIDING_BROADCAST_WINDOW_MS", RIDE_BROADCAST_WINDOW_SEC * 1000)
}

type RideLikeBookingTimes = {
  createdAt: Date
  scheduledAt?: Date | null
  requestedAt?: Date | null
}

/** End of the ride request broadcast / bidding window (wall clock). */
export function rideBookingRequestEndsAtMs(booking: RideLikeBookingTimes): number {
  const scheduled = booking.scheduledAt ? new Date(booking.scheduledAt).getTime() : NaN
  const baseTs =
    Number.isFinite(scheduled) && scheduled <= Date.now()
      ? scheduled
      : new Date((booking as { requestedAt?: Date | null }).requestedAt ?? booking.createdAt).getTime()
  return baseTs + rideBroadcastWindowMs()
}

type CourierBookingTimes = {
  createdAt: Date
  scheduledAt?: Date | null
  module?: string | null
}

export function courierBookingRequestEndsAtMs(booking: CourierBookingTimes): number {
  const mod = String(booking.module || "RIDE").toUpperCase()
  const ttlMs = mod === "RIDE" || mod === "RIDING" ? rideBroadcastWindowMs() : COURIER_NON_RIDE_BROADCAST_MS
  const baseTs = booking.scheduledAt
    ? new Date(booking.scheduledAt).getTime()
    : new Date(booking.createdAt).getTime()
  return baseTs + ttlMs
}

/** Bid must never outlive the request window: min(now + bidTtl, requestEndsAt). */
export function computeBidExpiresAt(requestEndsAtMs: number, bidTtlMs = ridingBidTtlMs()): Date {
  return new Date(Math.min(Date.now() + bidTtlMs, requestEndsAtMs))
}

export function ridingBidTtlSec(): number {
  return Math.max(1, Math.ceil(ridingBidTtlMs() / 1000))
}

export function rideBroadcastWindowSec(): number {
  return Math.max(1, Math.ceil(rideBroadcastWindowMs() / 1000))
}

/**
 * Last N seconds of the broadcast window where counter-offers are blocked.
 * Independent of RIDING_BID_TTL_MS (customer accept window per offer).
 */
export function ridingNewBidCutoffSec(): number {
  return numEnv("RIDING_BID_CUTOFF_SEC", DEFAULT_RIDING_BID_CUTOFF_SEC)
}

export function getRidingBiddingPolicy() {
  return {
    broadcastWindowSec: rideBroadcastWindowSec(),
    /** How long each submitted bid stays valid for the customer (seconds). */
    bidTtlSec: ridingBidTtlSec(),
    /** Seconds before broadcast ends when price bids are disabled (base accept only). */
    bidCutoffSec: ridingNewBidCutoffSec(),
  }
}

/** True when a rider may still submit a counter-offer (price bid). */
export function isNewCounterOfferAllowed(
  requestEndsAtMs: number,
  nowMs = Date.now(),
): boolean {
  if (!Number.isFinite(requestEndsAtMs) || nowMs >= requestEndsAtMs) return false
  const remainingSec = (requestEndsAtMs - nowMs) / 1000
  return remainingSec >= ridingNewBidCutoffSec()
}

export function broadcastSecondsRemaining(
  requestEndsAtMs: number,
  nowMs = Date.now(),
): number {
  if (!Number.isFinite(requestEndsAtMs)) return 0
  return Math.max(0, Math.ceil((requestEndsAtMs - nowMs) / 1000))
}

export async function expirePendingRideBidsForBooking(rideBookingId: string): Promise<void> {
  const booking = await prisma.rideBooking.findUnique({
    where: { id: rideBookingId },
    select: { createdAt: true, scheduledAt: true, requestedAt: true },
  })
  if (!booking) return
  const endMs = rideBookingRequestEndsAtMs(booking)
  const now = Date.now()
  if (now >= endMs) {
    await prisma.rideBid.updateMany({
      where: { rideBookingId, status: "PENDING" },
      data: { status: "EXPIRED" },
    })
    return
  }
  await prisma.rideBid.updateMany({
    where: { rideBookingId, status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  })
}

export async function expirePendingCourierBidsForBooking(courierBookingId: string): Promise<void> {
  const booking = await prisma.courierBooking.findUnique({
    where: { id: courierBookingId },
    select: { createdAt: true, scheduledAt: true, module: true },
  })
  if (!booking) return
  const endMs = courierBookingRequestEndsAtMs(booking)
  const now = Date.now()
  if (now >= endMs) {
    await prisma.courierBid.updateMany({
      where: { courierBookingId, status: "PENDING" },
      data: { status: "EXPIRED" },
    })
    return
  }
  await prisma.courierBid.updateMany({
    where: { courierBookingId, status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  })
}
