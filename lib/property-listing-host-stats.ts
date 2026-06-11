import { prisma } from "@/lib/prisma"

function monthBounds(offsetMonths = 0, ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth() + offsetMonths, 1)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
  const label = start.toLocaleString("en-US", { month: "short", year: "numeric" })
  return { start, end, label, daysInMonth: end.getDate() }
}

async function sumVendorPayoutsForListingInRange(
  listingId: string,
  start: Date,
  end: Date
): Promise<number> {
  const rows = await prisma.propertyBooking.findMany({
    where: {
      listingId,
      paymentStatus: "PAID",
      status: { in: ["COMPLETED", "ACTIVE", "CHECKED_IN", "CONFIRMED", "PENDING_APPROVAL"] },
      OR: [
        { escrowReleasedAt: { gte: start, lte: end } },
        {
          status: "COMPLETED",
          checkOut: { gte: start, lte: end },
        },
        {
          status: { in: ["CONFIRMED", "ACTIVE", "CHECKED_IN", "PENDING_APPROVAL"] },
          checkIn: { gte: start, lte: end },
        },
      ],
    },
    select: { subtotal: true, cleaningFee: true },
  })
  return rows.reduce((sum, b) => sum + b.subtotal + b.cleaningFee, 0)
}

function bookedNightsInRange(
  bookings: { checkIn: Date; checkOut: Date; nights: number }[],
  rangeStart: Date,
  rangeEnd: Date
): number {
  let total = 0
  for (const b of bookings) {
    const inMs = Math.max(b.checkIn.getTime(), rangeStart.getTime())
    const outMs = Math.min(b.checkOut.getTime(), rangeEnd.getTime())
    if (outMs > inMs) {
      total += Math.max(1, Math.ceil((outMs - inMs) / 86400000))
    } else {
      total += b.nights || 0
    }
  }
  return total
}

export async function computeListingHostStats(listingId: string) {
  const current = monthBounds(0)
  const previous = monthBounds(-1)

  const [grossPayoutsThisMonth, grossPayoutsLastMonth, stayCount, monthBookings] =
    await Promise.all([
      sumVendorPayoutsForListingInRange(listingId, current.start, current.end),
      sumVendorPayoutsForListingInRange(listingId, previous.start, previous.end),
      prisma.propertyBooking.count({
        where: {
          listingId,
          status: { in: ["COMPLETED", "ACTIVE", "CHECKED_IN", "CONFIRMED"] },
          paymentStatus: "PAID",
        },
      }),
      prisma.propertyBooking.findMany({
        where: {
          listingId,
          paymentStatus: "PAID",
          status: { notIn: ["CANCELLED", "REJECTED", "PENDING_PAYMENT", "REFUNDED"] },
          checkIn: { lte: current.end },
          checkOut: { gt: current.start },
        },
        select: { checkIn: true, checkOut: true, nights: true },
      }),
    ])

  const bookedNights = bookedNightsInRange(monthBookings, current.start, current.end)
  const occupancyPercent = Math.min(
    100,
    Math.round((bookedNights / Math.max(1, current.daysInMonth)) * 100)
  )

  let payoutTrendPercent: number | null = null
  if (grossPayoutsLastMonth > 0) {
    payoutTrendPercent = Math.round(
      ((grossPayoutsThisMonth - grossPayoutsLastMonth) / grossPayoutsLastMonth) * 100
    )
  } else if (grossPayoutsThisMonth > 0) {
    payoutTrendPercent = 100
  }

  return {
    monthLabel: current.label,
    grossPayoutsThisMonth: Math.round(grossPayoutsThisMonth),
    grossPayoutsLastMonth: Math.round(grossPayoutsLastMonth),
    payoutTrendPercent,
    occupancyPercent,
    staysHosted: stayCount,
    bookedNightsThisMonth: bookedNights,
  }
}

export function canRevealListingAccessForBooking(booking: {
  status: string
  paymentStatus: string
  customerId: string
}): boolean {
  if (booking.paymentStatus !== "PAID") return false
  return ["PENDING_APPROVAL", "CONFIRMED", "CHECKED_IN", "ACTIVE", "COMPLETED"].includes(
    booking.status
  )
}

export function pickListingAccessFields(listing: {
  wifiSsid?: string | null
  wifiPassword?: string | null
  gatePin?: string | null
}) {
  return {
    wifiSsid: listing.wifiSsid || null,
    wifiPassword: listing.wifiPassword || null,
    gatePin: listing.gatePin || null,
  }
}
