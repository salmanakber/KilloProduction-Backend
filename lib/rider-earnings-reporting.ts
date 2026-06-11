import { prisma } from "@/lib/prisma"
import { roundMoney2 } from "@/lib/money-round"

const RIDE_COMPLETED = ["COMPLETED", "DELIVERED"] as const
const COURIER_COMPLETED = ["COMPLETED", "DELIVERED"] as const

const RIDE_IN_PROGRESS = [
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_AT_DROPOFF",
  "BIDDING",
] as const

const COURIER_IN_PROGRESS = [
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_AT_DROPOFF",
  "BIDDING",
  "AWAITING_PREP",
] as const

export function isCashPaymentMethod(method: string | null | undefined): boolean {
  const m = String(method || "").toUpperCase()
  return m === "PAY_ON_ARRIVAL" || m === "CASH" || m === "CASH_ON_DELIVERY"
}

export async function buildRiderTripCounts(riderId: string, periodStart?: Date) {
  const [
    completedRides,
    inProgressRides,
    cancelledRides,
    completedCourier,
    inProgressCourier,
    cancelledCourier,
    periodCompletedRides,
    periodCompletedCourier,
  ] = await Promise.all([
    prisma.rideBooking.count({
      where: { riderId, status: { in: [...RIDE_COMPLETED] } },
    }),
    prisma.rideBooking.count({
      where: { riderId, status: { in: [...RIDE_IN_PROGRESS] } },
    }),
    prisma.rideBooking.count({ where: { riderId, status: "CANCELLED" } }),
    prisma.courierBooking.count({
      where: { riderId, status: { in: [...COURIER_COMPLETED] } },
    }),
    prisma.courierBooking.count({
      where: { riderId, status: { in: [...COURIER_IN_PROGRESS] } },
    }),
    prisma.courierBooking.count({ where: { riderId, status: "CANCELLED" } }),
    periodStart
      ? prisma.rideBooking.count({
          where: {
            riderId,
            status: { in: [...RIDE_COMPLETED] },
            OR: [
              { completedAt: { gte: periodStart } },
              { completedAt: null, updatedAt: { gte: periodStart } },
            ],
          },
        })
      : Promise.resolve(0),
    periodStart
      ? prisma.courierBooking.count({
          where: {
            riderId,
            status: { in: [...COURIER_COMPLETED] },
            OR: [
              { deliveredAt: { gte: periodStart } },
              { deliveredAt: null, updatedAt: { gte: periodStart } },
            ],
          },
        })
      : Promise.resolve(0),
  ])

  const completed = completedRides + completedCourier
  const inProgress = inProgressRides + inProgressCourier
  const cancelled = cancelledRides + cancelledCourier
  const periodCompleted =
    periodStart != null ? periodCompletedRides + periodCompletedCourier : completed

  return {
    completed,
    inProgress,
    cancelled,
    periodCompleted,
    completedRides,
    completedCourier,
    inProgressRides,
    inProgressCourier,
  }
}

type CompletedBookingMeta = {
  paymentMethod: string | null
  completionDate: Date | null
}

async function loadCompletedBookingMeta(riderId: string) {
  const [completedRides, completedCouriers] = await Promise.all([
    prisma.rideBooking.findMany({
      where: { riderId, status: { in: [...RIDE_COMPLETED] } },
      select: { id: true, paymentMethod: true, completedAt: true, updatedAt: true },
    }),
    prisma.courierBooking.findMany({
      where: { riderId, status: { in: [...COURIER_COMPLETED] } },
      select: {
        id: true,
        orderId: true,
        paymentMethod: true,
        deliveredAt: true,
        updatedAt: true,
      },
    }),
  ])

  const rideMeta = new Map<string, CompletedBookingMeta>()
  for (const ride of completedRides) {
    rideMeta.set(ride.id, {
      paymentMethod: ride.paymentMethod,
      completionDate: ride.completedAt ?? ride.updatedAt,
    })
  }

  const orderMeta = new Map<string, CompletedBookingMeta>()
  const courierIdMeta = new Map<string, CompletedBookingMeta>()
  for (const courier of completedCouriers) {
    const meta: CompletedBookingMeta = {
      paymentMethod: courier.paymentMethod,
      completionDate: courier.deliveredAt ?? courier.updatedAt,
    }
    courierIdMeta.set(courier.id, meta)
    if (courier.orderId) {
      orderMeta.set(courier.orderId, meta)
    }
  }

  return { rideMeta, orderMeta, courierIdMeta, completedRideIds: completedRides.map((r) => r.id) }
}

function resolveEarningMeta(
  earning: { rideBookingId: string | null; orderId: string | null },
  meta: Awaited<ReturnType<typeof loadCompletedBookingMeta>>
): CompletedBookingMeta | null {
  if (earning.rideBookingId) {
    return meta.rideMeta.get(earning.rideBookingId) ?? null
  }
  if (earning.orderId) {
    return (
      meta.orderMeta.get(earning.orderId) ??
      meta.courierIdMeta.get(earning.orderId) ??
      null
    )
  }
  return null
}

export async function buildRiderEarningsByChannel(riderId: string, periodStart?: Date) {
  const bookingMeta = await loadCompletedBookingMeta(riderId)

  const linkOr: Array<Record<string, unknown>> = [{ rideBookingId: { in: bookingMeta.completedRideIds } }]
  const orderKeys = [
    ...Array.from(bookingMeta.orderMeta.keys()),
    ...Array.from(bookingMeta.courierIdMeta.keys()),
  ]
  if (orderKeys.length) {
    linkOr.push({ orderId: { in: orderKeys } })
  }

  const linkedEarnings = await prisma.riderEarning.findMany({
    where: {
      riderId,
      OR: linkOr,
    },
  })

  const unlinkedEarnings = await prisma.riderEarning.findMany({
    where: {
      riderId,
      rideBookingId: null,
      orderId: null,
    },
  })

  let onlineNet = 0
  let cashCollectedNet = 0
  let periodOnlineNet = 0
  let periodCashNet = 0

  const applyNet = (net: number, booking: CompletedBookingMeta | null, createdAt: Date) => {
    const isCash = isCashPaymentMethod(booking?.paymentMethod)
    const completionDate = booking?.completionDate ?? createdAt
    if (isCash) {
      cashCollectedNet += net
      if (periodStart && completionDate >= periodStart) periodCashNet += net
    } else {
      onlineNet += net
      if (periodStart && completionDate >= periodStart) periodOnlineNet += net
    }
  }

  for (const earning of linkedEarnings) {
    const booking = resolveEarningMeta(earning, bookingMeta)
    if (!booking) continue
    applyNet(earning.netAmount || 0, booking, earning.createdAt)
  }

  for (const earning of unlinkedEarnings) {
    applyNet(earning.netAmount || 0, null, earning.createdAt)
  }

  const platformCommissionOwedAgg = await prisma.riderPayableCommission.aggregate({
    where: { riderId, status: "PENDING" },
    _sum: { commissionAmount: true },
  })

  return {
    onlineNet: roundMoney2(onlineNet),
    cashCollectedNet: roundMoney2(cashCollectedNet),
    periodOnlineNet: roundMoney2(periodOnlineNet),
    periodCashNet: roundMoney2(periodCashNet),
    platformCommissionOwed: roundMoney2(platformCommissionOwedAgg._sum.commissionAmount ?? 0),
    totalReportingNet: roundMoney2(onlineNet + cashCollectedNet),
    periodReportingNet: roundMoney2(periodOnlineNet + periodCashNet),
  }
}

export async function buildRiderDailyChannelChart(
  riderId: string,
  periodStart: Date,
  periodEnd: Date
) {
  const bookingMeta = await loadCompletedBookingMeta(riderId)
  const linkOr: Array<Record<string, unknown>> = [{ rideBookingId: { in: bookingMeta.completedRideIds } }]
  const orderKeys = [
    ...Array.from(bookingMeta.orderMeta.keys()),
    ...Array.from(bookingMeta.courierIdMeta.keys()),
  ]
  if (orderKeys.length) {
    linkOr.push({ orderId: { in: orderKeys } })
  }

  const earnings = await prisma.riderEarning.findMany({
    where: {
      riderId,
      createdAt: { gte: periodStart, lte: periodEnd },
      OR: linkOr,
    },
  })

  const dailyOnline: Record<string, number> = {}
  const dailyCash: Record<string, number> = {}

  for (const earning of earnings) {
    const booking = resolveEarningMeta(earning, bookingMeta)
    if (!booking?.completionDate) continue
    if (booking.completionDate < periodStart || booking.completionDate > periodEnd) continue
    const dateKey = booking.completionDate.toISOString().split("T")[0]
    const net = earning.netAmount || 0
    if (isCashPaymentMethod(booking.paymentMethod)) {
      dailyCash[dateKey] = (dailyCash[dateKey] || 0) + net
    } else {
      dailyOnline[dateKey] = (dailyOnline[dateKey] || 0) + net
    }
  }

  return { dailyOnline, dailyCash }
}
