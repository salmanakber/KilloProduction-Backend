import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { getGlobalSocketServer } from "@/lib/socket-server"

/**
 * Pickup waiting charges/notifications apply only to standalone customer riding:
 * - `RideBooking` (always)
 * - `CourierBooking` only when `module` is empty or `RIDE` (same UX as riding).
 * Interconnect courier (food/grocery/pharmacy/etc.) is excluded.
 */
export function courierModuleEligibleForPickupWaitingPolicy(
  module: string | null | undefined
): boolean {
  const m = String(module ?? "").trim().toUpperCase()
  return m === "" || m === "RIDE"
}

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Whole billable minutes (ceil) after grace, at time `at` since `arrivedAt`. */
export function wholeBillablePickupMinutesAt(args: {
  arrivedAt: Date
  at: Date
  graceMinutes: number
}): number {
  const ms = Math.max(0, args.at.getTime() - args.arrivedAt.getTime())
  const elapsedMinutes = ms / 60_000
  const raw = elapsedMinutes - Math.max(0, args.graceMinutes || 0)
  return Math.max(0, Math.ceil(raw))
}

/**
 * Billable pickup waiting: time from `arrivedAt` to `pickedUpAt`, minus grace, charged in whole minutes (ceil).
 */
export function computeBillablePickupWaiting(args: {
  arrivedAt: Date | null
  pickedUpAt: Date
  graceMinutes: number
  pricePerMinute: number
}): { minutesBillable: number; fee: number; elapsedMinutes: number } {
  if (!args.arrivedAt || args.pricePerMinute <= 0) {
    return { minutesBillable: 0, fee: 0, elapsedMinutes: 0 }
  }
  const ms = Math.max(0, args.pickedUpAt.getTime() - args.arrivedAt.getTime())
  const elapsedMinutes = ms / 60_000
  const rawBillable = elapsedMinutes - Math.max(0, args.graceMinutes || 0)
  const minutesBillable = Math.max(0, Math.ceil(rawBillable))
  const fee = roundMoney2(minutesBillable * args.pricePerMinute)
  return { minutesBillable, fee, elapsedMinutes }
}

export function buildRideLifecycleTimestampPatch(args: {
  nextStatus: string
  now: Date
  existing: {
    acceptedAt: Date | null
    arrivedAt: Date | null
    pickedUpAt: Date | null
    completedAt: Date | null
    cancelledAt: Date | null
  }
}): Record<string, Date> {
  const { nextStatus, now, existing } = args
  const out: Record<string, Date> = {}
  if ((nextStatus === "ACCEPTED" || nextStatus === "RIDER_ASSIGNED") && !existing.acceptedAt) {
    out.acceptedAt = now
  }
  if (nextStatus === "ARRIVED_AT_PICKUP" && !existing.arrivedAt) {
    out.arrivedAt = now
  }
  if (nextStatus === "PICKED_UP" && !existing.pickedUpAt) {
    out.pickedUpAt = now
  }
  if (nextStatus === "COMPLETED" && !existing.completedAt) {
    out.completedAt = now
  }
  if (nextStatus === "CANCELLED" && !existing.cancelledAt) {
    out.cancelledAt = now
  }
  return out
}

export function buildCourierLifecycleTimestampPatch(args: {
  nextStatus: string
  now: Date
  multiplePickupId?: string | null
  /** Courier `module`; pickup `arrivedAt` for waiting is not set for interconnect deliveries. */
  module?: string | null
  existing: {
    acceptedAt: Date | null
    arrivedAt: Date | null
    pickedUpAt: Date | null
    deliveredAt: Date | null
    cancelledAt: Date | null
  }
}): Record<string, Date> {
  const { nextStatus, now, existing } = args
  const mpId = args.multiplePickupId ? String(args.multiplePickupId).trim() : ""
  const out: Record<string, Date> = {}
  if ((nextStatus === "ACCEPTED" || nextStatus === "RIDER_ASSIGNED") && !existing.acceptedAt) {
    out.acceptedAt = now
  }
  const allowPickupWaitArrived =
    courierModuleEligibleForPickupWaitingPolicy(args.module)
  if (
    nextStatus === "ARRIVED_AT_PICKUP" &&
    !mpId &&
    !existing.arrivedAt &&
    allowPickupWaitArrived
  ) {
    out.arrivedAt = now
  }
  if (nextStatus === "PICKED_UP" && !existing.pickedUpAt) {
    out.pickedUpAt = now
  }
  if ((nextStatus === "COMPLETED" || nextStatus === "DELIVERED") && !existing.deliveredAt) {
    out.deliveredAt = now
  }
  if (nextStatus === "CANCELLED" && !existing.cancelledAt) {
    out.cancelledAt = now
  }
  return out
}

async function courierMultiPickupCount(courierBookingId: string): Promise<number> {
  return prisma.multiplePickup.count({ where: { courierBookingId } })
}

/** Reset accrual + notification markers when a new pickup-wait window starts. */
export function getPickupWaitingArrivalResetPatch() {
  return {
    pickupWaitingAccruedFee: 0,
    pickupWaitingBillableMinutesCharged: 0,
    pickupWaitingGraceNotified50At: null,
    pickupWaitingGraceNotified90At: null,
    pickupWaitingChargeNotifiedAt: null,
    pickupWaitingBreakdown: Prisma.JsonNull,
    pickupWaitingFee: null,
    pickupWaitingMinutesBillable: null,
  }
}

function appendBreakdown(
  existing: Prisma.JsonValue | null | undefined,
  entry: Record<string, unknown>
): Prisma.InputJsonValue {
  const arr = Array.isArray(existing) ? [...(existing as unknown[])] : []
  arr.push({ t: new Date().toISOString(), ...entry })
  const cap = 48
  const trimmed = arr.length > cap ? arr.slice(arr.length - cap) : arr
  return trimmed as Prisma.InputJsonValue
}

export type PickupWaitingSocketPayload = {
  type: "pickup_waiting_update"
  bookingId: string
  bookingType: "ride" | "courier"
  status: string
  graceMinutes: number
  pricePerMinute: number
  arrivedAt: string
  billableMinutesCharged: number
  pickupWaitingAccruedFee: number
  totalFare: number
  estimatedFare?: number | null
  serverNow: string
}

function emitPickupWaitingUpdate(p: PickupWaitingSocketPayload, customerId: string, riderId: string | null) {
  try {
    const io = getGlobalSocketServer()
    const targets = new Set<string>([customerId])
    if (riderId) targets.add(riderId)
    for (const uid of targets) {
      void io.sendNotificationToUser(uid, p)
    }
  } catch {
    // socket may be unavailable in scripts
  }
}

export async function buildRidePickupWaitingPatchOnPickUp(args: {
  rideBookingId: string
  pickedUpAt: Date
  arrivedAt: Date | null
  existingPickupWaitingFee: number | null
}): Promise<{
  pickupWaitingFee: number | null
  pickupWaitingMinutesBillable: number | null
  finalFareDelta: number
}> {
  if (args.existingPickupWaitingFee != null) {
    return { pickupWaitingFee: null, pickupWaitingMinutesBillable: null, finalFareDelta: 0 }
  }
  const row = await prisma.rideBooking.findUnique({
    where: { id: args.rideBookingId },
    select: {
      finalFare: true,
      estimatedFare: true,
      pickupWaitingAccruedFee: true,
      rideType: {
        select: { waitingGraceMinutes: true, waitingPricePerMinute: true },
      },
    },
  })
  if (!row?.rideType) {
    return { pickupWaitingFee: 0, pickupWaitingMinutesBillable: 0, finalFareDelta: 0 }
  }
  const { minutesBillable, fee } = computeBillablePickupWaiting({
    arrivedAt: args.arrivedAt,
    pickedUpAt: args.pickedUpAt,
    graceMinutes: row.rideType.waitingGraceMinutes ?? 0,
    pricePerMinute: row.rideType.waitingPricePerMinute ?? 0,
  })
  const live = Number(row.pickupWaitingAccruedFee ?? 0)
  const displayedFare = Number(row.finalFare ?? row.estimatedFare ?? 0)
  const newFinal = roundMoney2(displayedFare - live + fee)
  const finalFareDelta = roundMoney2(newFinal - displayedFare)
  return {
    pickupWaitingFee: fee,
    pickupWaitingMinutesBillable: minutesBillable,
    finalFareDelta,
  }
}

export async function buildCourierPickupWaitingPatchOnPickUp(args: {
  courierBookingId: string
  pickedUpAt: Date
  arrivedAt: Date | null
  existingPickupWaitingFee: number | null
}): Promise<{
  pickupWaitingFee: number | null
  pickupWaitingMinutesBillable: number | null
  fareDelta: number
}> {
  if (args.existingPickupWaitingFee != null) {
    return { pickupWaitingFee: null, pickupWaitingMinutesBillable: null, fareDelta: 0 }
  }
  const row = await prisma.courierBooking.findUnique({
    where: { id: args.courierBookingId },
    select: {
      module: true,
      fare: true,
      pickupWaitingAccruedFee: true,
      rideType: {
        select: { waitingGraceMinutes: true, waitingPricePerMinute: true },
      },
    },
  })
  if (!courierModuleEligibleForPickupWaitingPolicy(row?.module)) {
    return { pickupWaitingFee: 0, pickupWaitingMinutesBillable: 0, fareDelta: 0 }
  }
  if (!row?.rideType) {
    return { pickupWaitingFee: 0, pickupWaitingMinutesBillable: 0, fareDelta: 0 }
  }
  const mpCount = await courierMultiPickupCount(args.courierBookingId)
  if (mpCount > 0) {
    return { pickupWaitingFee: 0, pickupWaitingMinutesBillable: 0, fareDelta: 0 }
  }
  const { minutesBillable, fee } = computeBillablePickupWaiting({
    arrivedAt: args.arrivedAt,
    pickedUpAt: args.pickedUpAt,
    graceMinutes: row.rideType.waitingGraceMinutes ?? 0,
    pricePerMinute: row.rideType.waitingPricePerMinute ?? 0,
  })
  const live = Number(row.pickupWaitingAccruedFee ?? 0)
  const displayedFare = Number(row.fare ?? 0)
  const newFare = roundMoney2(displayedFare - live + fee)
  const fareDelta = roundMoney2(newFare - displayedFare)
  return {
    pickupWaitingFee: fee,
    pickupWaitingMinutesBillable: minutesBillable,
    fareDelta,
  }
}

function billableWaitingWindowStarted(args: {
  arrivedAt: Date
  graceMinutes: number
  now: Date
}): boolean {
  const threshold = args.arrivedAt.getTime() + Math.max(0, args.graceMinutes) * 60_000
  return args.now.getTime() >= threshold
}

/**
 * Idempotent: claims `pickupWaitingChargeNotifiedAt` once, then notifies the customer that paid waiting started.
 */
export async function tryNotifyCustomerBillablePickupWaitingStarted(params: {
  kind: "ride" | "courier"
  bookingId: string
  now?: Date
}): Promise<{ sent: boolean }> {
  const now = params.now ?? new Date()

  if (params.kind === "ride") {
    const booking = await prisma.rideBooking.findUnique({
      where: { id: params.bookingId },
      include: {
        rideType: { select: { waitingGraceMinutes: true, waitingPricePerMinute: true } },
        customer: { select: { id: true } },
      },
    })
    if (
      !booking ||
      !booking.customer ||
      booking.status !== "ARRIVED_AT_PICKUP" ||
      !booking.arrivedAt ||
      booking.pickedUpAt ||
      booking.pickupWaitingChargeNotifiedAt
    ) {
      return { sent: false }
    }
    const grace = booking.rideType.waitingGraceMinutes ?? 0
    const rate = booking.rideType.waitingPricePerMinute ?? 0
    if (rate <= 0) return { sent: false }
    if (!billableWaitingWindowStarted({ arrivedAt: booking.arrivedAt, graceMinutes: grace, now })) {
      return { sent: false }
    }
    const claimed = await prisma.rideBooking.updateMany({
      where: {
        id: params.bookingId,
        pickupWaitingChargeNotifiedAt: null,
        status: "ARRIVED_AT_PICKUP",
        pickedUpAt: null,
      },
      data: { pickupWaitingChargeNotifiedAt: now },
    })
    if (claimed.count !== 1) return { sent: false }
    await NotificationBridge.sendNotification({
      userId: booking.customerId,
      title: "Pickup waiting charges started",
      message: `Your rider has been waiting beyond the included pickup time. Additional waiting is now billed at ${rate} per minute for booking #${booking.bookingNumber}.`,
      type: "ORDER_UPDATE",
      module: "RIDING",
      actionUrl: `/riding/bookings/${params.bookingId}`,
      data: {
        actionType: "navigate",
        screen: "RideBookingScreen",
        pickupWaitingChargesActive: true,
        bookingId: params.bookingId,
        bookingType: "ride",
      },
    })
    return { sent: true }
  }

  const booking = await prisma.courierBooking.findUnique({
    where: { id: params.bookingId },
    include: {
      rideType: { select: { waitingGraceMinutes: true, waitingPricePerMinute: true } },
      customer: { select: { id: true } },
    },
  })
  if (
    !booking ||
    !booking.customer ||
    !courierModuleEligibleForPickupWaitingPolicy(booking.module) ||
    booking.status !== "ARRIVED_AT_PICKUP" ||
    !booking.arrivedAt ||
    booking.pickedUpAt ||
    booking.pickupWaitingChargeNotifiedAt
  ) {
    return { sent: false }
  }
  const grace = booking.rideType.waitingGraceMinutes ?? 0
  const rate = booking.rideType.waitingPricePerMinute ?? 0
  if (rate <= 0) return { sent: false }
  if (!billableWaitingWindowStarted({ arrivedAt: booking.arrivedAt, graceMinutes: grace, now })) {
    return { sent: false }
  }
  const mpCount = await courierMultiPickupCount(params.bookingId)
  if (mpCount > 0) return { sent: false }

  const claimed = await prisma.courierBooking.updateMany({
    where: {
      id: params.bookingId,
      pickupWaitingChargeNotifiedAt: null,
      status: "ARRIVED_AT_PICKUP",
      pickedUpAt: null,
    },
    data: { pickupWaitingChargeNotifiedAt: now },
  })
  if (claimed.count !== 1) return { sent: false }
  await NotificationBridge.sendNotification({
    userId: booking.customerId,
    title: "Pickup waiting charges started",
    message: `Your courier has been waiting beyond the included pickup time. Additional waiting is now billed at ${rate} per minute for booking #${booking.bookingNumber}.`,
    type: "ORDER_UPDATE",
    module: "COURIER",
    actionUrl: `/courier-bookings/${params.bookingId}`,
    data: {
      actionType: "navigate",
      screen: "CourierBookingScreen",
      params: { bookingId: params.bookingId },
      pickupWaitingChargesActive: true,
      bookingId: params.bookingId,
      bookingType: "courier",
    },
  })
  return { sent: true }
}

async function tryNotifyGraceMilestoneRide(
  bookingId: string,
  pct: 50 | 90,
  now: Date
): Promise<boolean> {
  const field = pct === 50 ? "pickupWaitingGraceNotified50At" : "pickupWaitingGraceNotified90At"
  const booking = await prisma.rideBooking.findUnique({
    where: { id: bookingId },
    include: {
      rideType: { select: { waitingGraceMinutes: true, waitingPricePerMinute: true } },
      customer: { select: { id: true } },
    },
  })
  if (
    !booking?.customer ||
    booking.status !== "ARRIVED_AT_PICKUP" ||
    !booking.arrivedAt ||
    booking.pickedUpAt
  ) {
    return false
  }
  const graceMin = Math.max(0, booking.rideType.waitingGraceMinutes ?? 0)
  const rate = booking.rideType.waitingPricePerMinute ?? 0
  if (graceMin <= 0 || rate <= 0) return false
  const frac = pct === 50 ? 0.5 : 0.9
  const threshold = new Date(booking.arrivedAt.getTime() + graceMin * frac * 60_000)
  if (now.getTime() < threshold.getTime()) return false
  const graceEnd = new Date(booking.arrivedAt.getTime() + graceMin * 60_000)
  if (now.getTime() >= graceEnd.getTime()) return false

  const claimed = await prisma.rideBooking.updateMany({
    where: {
      id: bookingId,
      status: "ARRIVED_AT_PICKUP",
      pickedUpAt: null,
      arrivedAt: { not: null },
      ...(pct === 50
        ? { pickupWaitingGraceNotified50At: null }
        : { pickupWaitingGraceNotified90At: null }),
    },
    data: {
      ...(pct === 50 ? { pickupWaitingGraceNotified50At: now } : { pickupWaitingGraceNotified90At: now }),
    },
  })
  if (claimed.count !== 1) return false

  const label = pct === 50 ? "halfway" : "almost"
  await NotificationBridge.sendNotification({
    userId: booking.customerId,
    title: pct === 50 ? "Pickup grace: halfway" : "Pickup grace: almost over",
    message:
      pct === 50
        ? `Your rider has waited ${Math.round(graceMin * 0.5)} of ${graceMin} free minutes at pickup for #${booking.bookingNumber}. After ${graceMin} minutes, waiting is billed at ${rate}/min.`
        : `About ${Math.ceil(graceMin * 0.1)} free minute(s) left at pickup for #${booking.bookingNumber}. Then waiting is billed at ${rate}/min.`,
    type: "ORDER_UPDATE",
    module: "RIDING",
    actionUrl: `/riding/bookings/${bookingId}`,
    data: {
      pickupWaitingGraceWarning: label,
      bookingId,
      bookingType: "ride",
    },
  })
  return true
}

async function tryNotifyGraceMilestoneCourier(
  bookingId: string,
  pct: 50 | 90,
  now: Date
): Promise<boolean> {
  const booking = await prisma.courierBooking.findUnique({
    where: { id: bookingId },
    include: {
      rideType: { select: { waitingGraceMinutes: true, waitingPricePerMinute: true } },
      customer: { select: { id: true } },
    },
  })
  if (
    !booking?.customer ||
    !courierModuleEligibleForPickupWaitingPolicy(booking.module) ||
    booking.status !== "ARRIVED_AT_PICKUP" ||
    !booking.arrivedAt ||
    booking.pickedUpAt
  ) {
    return false
  }
  if ((await courierMultiPickupCount(bookingId)) > 0) return false
  const graceMin = Math.max(0, booking.rideType.waitingGraceMinutes ?? 0)
  const rate = booking.rideType.waitingPricePerMinute ?? 0
  if (graceMin <= 0 || rate <= 0) return false
  const frac = pct === 50 ? 0.5 : 0.9
  const threshold = new Date(booking.arrivedAt.getTime() + graceMin * frac * 60_000)
  if (now.getTime() < threshold.getTime()) return false
  const graceEnd = new Date(booking.arrivedAt.getTime() + graceMin * 60_000)
  if (now.getTime() >= graceEnd.getTime()) return false

  const claimed = await prisma.courierBooking.updateMany({
    where: {
      id: bookingId,
      status: "ARRIVED_AT_PICKUP",
      pickedUpAt: null,
      arrivedAt: { not: null },
      ...(pct === 50
        ? { pickupWaitingGraceNotified50At: null }
        : { pickupWaitingGraceNotified90At: null }),
    },
    data: {
      ...(pct === 50 ? { pickupWaitingGraceNotified50At: now } : { pickupWaitingGraceNotified90At: now }),
    },
  })
  if (claimed.count !== 1) return false

  const label = pct === 50 ? "halfway" : "almost"
  await NotificationBridge.sendNotification({
    userId: booking.customerId,
    title: pct === 50 ? "Pickup grace: halfway" : "Pickup grace: almost over",
    message:
      pct === 50
        ? `Your courier has waited ${Math.round(graceMin * 0.5)} of ${graceMin} free minutes at pickup for #${booking.bookingNumber}. After ${graceMin} minutes, waiting is billed at ${rate}/min.`
        : `About ${Math.ceil(graceMin * 0.1)} free minute(s) left at pickup for #${booking.bookingNumber}. Then waiting is billed at ${rate}/min.`,
    type: "ORDER_UPDATE",
    module: "COURIER",
    actionUrl: `/courier-bookings/${bookingId}`,
    data: {
      pickupWaitingGraceWarning: label,
      bookingId,
      bookingType: "courier",
    },
  })
  return true
}

async function processRidePickupWaitingRow(bookingId: string, now: Date, stats: {
  grace50: number
  grace90: number
  accruals: number
  chargeStarts: number
}): Promise<void> {
  const row = await prisma.rideBooking.findUnique({
    where: { id: bookingId },
    include: {
      rideType: { select: { waitingGraceMinutes: true, waitingPricePerMinute: true } },
    },
  })
  if (
    !row ||
    row.status !== "ARRIVED_AT_PICKUP" ||
    !row.arrivedAt ||
    row.pickedUpAt
  ) {
    return
  }
  const grace = row.rideType.waitingGraceMinutes ?? 0
  const rate = row.rideType.waitingPricePerMinute ?? 0
  if (rate <= 0) return

  if (grace > 0) {
    if (await tryNotifyGraceMilestoneRide(bookingId, 50, now)) stats.grace50++
    if (await tryNotifyGraceMilestoneRide(bookingId, 90, now)) stats.grace90++
  }

  const charged = row.pickupWaitingBillableMinutesCharged ?? 0
  const currentWhole = wholeBillablePickupMinutesAt({
    arrivedAt: row.arrivedAt,
    at: now,
    graceMinutes: grace,
  })
  const deltaM = currentWhole - charged
  if (deltaM <= 0) {
    return
  }

  const deltaFee = roundMoney2(deltaM * rate)
  const live = Number(row.pickupWaitingAccruedFee ?? 0)
  const newAccrued = roundMoney2(live + deltaFee)
  const displayedFare = Number(row.finalFare ?? row.estimatedFare ?? 0)
  const newFinal = roundMoney2(displayedFare + deltaFee)
  const breakdown = appendBreakdown(row.pickupWaitingBreakdown as Prisma.JsonValue, {
    kind: "accrual",
    deltaMin: deltaM,
    deltaFee,
    runningFee: newAccrued,
  })

  const updated = await prisma.rideBooking.updateMany({
    where: {
      id: bookingId,
      status: "ARRIVED_AT_PICKUP",
      pickedUpAt: null,
      pickupWaitingBillableMinutesCharged: charged,
    },
    data: {
      pickupWaitingBillableMinutesCharged: currentWhole,
      pickupWaitingAccruedFee: newAccrued,
      finalFare: newFinal,
      pickupWaitingBreakdown: breakdown,
    },
  })
  if (updated.count !== 1) return

  stats.accruals++
  const { sent } = await tryNotifyCustomerBillablePickupWaitingStarted({
    kind: "ride",
    bookingId,
    now,
  })
  if (sent) stats.chargeStarts++

  const fresh = await prisma.rideBooking.findUnique({
    where: { id: bookingId },
    select: {
      customerId: true,
      riderId: true,
      arrivedAt: true,
      finalFare: true,
      estimatedFare: true,
      pickupWaitingAccruedFee: true,
      pickupWaitingBillableMinutesCharged: true,
    },
  })
  if (fresh) {
    const p = buildRideSocketSnapshotFromParts({
      bookingId,
      arrivedAt: fresh.arrivedAt!,
      grace,
      rate,
      billableMinutesCharged: fresh.pickupWaitingBillableMinutesCharged ?? 0,
      accrued: Number(fresh.pickupWaitingAccruedFee ?? 0),
      totalFare: Number(fresh.finalFare ?? fresh.estimatedFare ?? 0),
      estimatedFare: fresh.estimatedFare,
      now,
    })
    emitPickupWaitingUpdate(p, fresh.customerId, fresh.riderId)
  }
}

function buildRideSocketSnapshotFromParts(args: {
  bookingId: string
  arrivedAt: Date
  grace: number
  rate: number
  billableMinutesCharged: number
  accrued: number
  totalFare: number
  estimatedFare: number
  now: Date
}): PickupWaitingSocketPayload {
  return {
    type: "pickup_waiting_update",
    bookingId: args.bookingId,
    bookingType: "ride",
    status: "ARRIVED_AT_PICKUP",
    graceMinutes: args.grace,
    pricePerMinute: args.rate,
    arrivedAt: args.arrivedAt.toISOString(),
    billableMinutesCharged: args.billableMinutesCharged,
    pickupWaitingAccruedFee: args.accrued,
    totalFare: args.totalFare,
    estimatedFare: args.estimatedFare,
    serverNow: args.now.toISOString(),
  }
}

async function processCourierPickupWaitingRow(bookingId: string, now: Date, stats: {
  grace50: number
  grace90: number
  accruals: number
  chargeStarts: number
}): Promise<void> {
  const row = await prisma.courierBooking.findUnique({
    where: { id: bookingId },
    include: {
      rideType: { select: { waitingGraceMinutes: true, waitingPricePerMinute: true } },
    },
  })
  if (
    !row ||
    !courierModuleEligibleForPickupWaitingPolicy(row.module) ||
    row.status !== "ARRIVED_AT_PICKUP" ||
    !row.arrivedAt ||
    row.pickedUpAt
  ) {
    return
  }
  if ((await courierMultiPickupCount(bookingId)) > 0) return

  const grace = row.rideType.waitingGraceMinutes ?? 0
  const rate = row.rideType.waitingPricePerMinute ?? 0
  if (rate <= 0) return

  if (grace > 0) {
    if (await tryNotifyGraceMilestoneCourier(bookingId, 50, now)) stats.grace50++
    if (await tryNotifyGraceMilestoneCourier(bookingId, 90, now)) stats.grace90++
  }

  const charged = row.pickupWaitingBillableMinutesCharged ?? 0
  const currentWhole = wholeBillablePickupMinutesAt({
    arrivedAt: row.arrivedAt,
    at: now,
    graceMinutes: grace,
  })
  const deltaM = currentWhole - charged
  if (deltaM <= 0) {
    return
  }

  const deltaFee = roundMoney2(deltaM * rate)
  const live = Number(row.pickupWaitingAccruedFee ?? 0)
  const newAccrued = roundMoney2(live + deltaFee)
  const displayedFare = Number(row.fare ?? 0)
  const newFare = roundMoney2(displayedFare + deltaFee)
  const breakdown = appendBreakdown(row.pickupWaitingBreakdown as Prisma.JsonValue, {
    kind: "accrual",
    deltaMin: deltaM,
    deltaFee,
    runningFee: newAccrued,
  })

  const updated = await prisma.courierBooking.updateMany({
    where: {
      id: bookingId,
      status: "ARRIVED_AT_PICKUP",
      pickedUpAt: null,
      pickupWaitingBillableMinutesCharged: charged,
    },
    data: {
      pickupWaitingBillableMinutesCharged: currentWhole,
      pickupWaitingAccruedFee: newAccrued,
      fare: newFare,
      pickupWaitingBreakdown: breakdown,
    },
  })
  if (updated.count !== 1) return

  stats.accruals++
  const { sent } = await tryNotifyCustomerBillablePickupWaitingStarted({
    kind: "courier",
    bookingId,
    now,
  })
  if (sent) stats.chargeStarts++

  const fresh = await prisma.courierBooking.findUnique({
    where: { id: bookingId },
    select: {
      customerId: true,
      riderId: true,
      arrivedAt: true,
      fare: true,
      pickupWaitingAccruedFee: true,
      pickupWaitingBillableMinutesCharged: true,
    },
  })
  if (fresh) {
    const p = buildCourierSocketSnapshotFromParts({
      bookingId,
      arrivedAt: fresh.arrivedAt!,
      grace,
      rate,
      billableMinutesCharged: fresh.pickupWaitingBillableMinutesCharged ?? 0,
      accrued: Number(fresh.pickupWaitingAccruedFee ?? 0),
      totalFare: Number(fresh.fare ?? 0),
      now,
    })
    emitPickupWaitingUpdate(p, fresh.customerId, fresh.riderId)
  }
}

function buildCourierSocketSnapshotFromParts(args: {
  bookingId: string
  arrivedAt: Date
  grace: number
  rate: number
  billableMinutesCharged: number
  accrued: number
  totalFare: number
  now: Date
}): PickupWaitingSocketPayload {
  return {
    type: "pickup_waiting_update",
    bookingId: args.bookingId,
    bookingType: "courier",
    status: "ARRIVED_AT_PICKUP",
    graceMinutes: args.grace,
    pricePerMinute: args.rate,
    arrivedAt: args.arrivedAt.toISOString(),
    billableMinutesCharged: args.billableMinutesCharged,
    pickupWaitingAccruedFee: args.accrued,
    totalFare: args.totalFare,
    estimatedFare: null,
    serverNow: args.now.toISOString(),
  }
}

/**
 * Grace warnings (50% / 90% of free window), incremental fare accrual each billable minute,
 * charge-started push, and realtime `pickup_waiting_update` sockets for rider + customer.
 */
export async function runPickupWaitingJobs(now = new Date()): Promise<{
  rideCandidates: number
  courierCandidates: number
  grace50: number
  grace90: number
  accruals: number
  chargeStarts: number
}> {
  const stats = { grace50: 0, grace90: 0, accruals: 0, chargeStarts: 0 }

  const [rideRows, courierRows] = await Promise.all([
    prisma.rideBooking.findMany({
      where: {
        status: "ARRIVED_AT_PICKUP",
        arrivedAt: { not: null },
        pickedUpAt: null,
      },
      select: { id: true },
      take: 400,
    }),
    prisma.courierBooking.findMany({
      where: {
        status: "ARRIVED_AT_PICKUP",
        arrivedAt: { not: null },
        pickedUpAt: null,
        OR: [{ module: null }, { module: "" }, { module: "RIDE" }, { module: "ride" }],
      },
      select: { id: true },
      take: 400,
    }),
  ])

  for (const r of rideRows) {
    await processRidePickupWaitingRow(r.id, now, stats)
  }
  for (const c of courierRows) {
    await processCourierPickupWaitingRow(c.id, now, stats)
  }

  return {
    rideCandidates: rideRows.length,
    courierCandidates: courierRows.length,
    ...stats,
  }
}

/** @deprecated use {@link runPickupWaitingJobs} */
export async function runPickupWaitingChargeNotificationsJob(now = new Date()) {
  const r = await runPickupWaitingJobs(now)
  return {
    rideCandidates: r.rideCandidates,
    courierCandidates: r.courierCandidates,
    notificationsSent: r.chargeStarts + r.grace50 + r.grace90,
  }
}
