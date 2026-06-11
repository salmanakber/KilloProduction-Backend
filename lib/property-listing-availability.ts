import { prisma } from "@/lib/prisma"

const ACTIVE_BOOKING_STATUSES = [
  "PENDING_PAYMENT",
  "PENDING_APPROVAL",
  "CONFIRMED",
  "CHECKED_IN",
  "ACTIVE",
] as const

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function eachNightInRange(checkIn: Date, checkOut: Date): string[] {
  const nights: string[] = []
  const cursor = new Date(checkIn)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(checkOut)
  end.setHours(0, 0, 0, 0)
  while (cursor < end) {
    nights.push(dateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return nights
}

export async function getPropertyListingAvailability(
  listingId: string,
  rangeFrom?: Date,
  rangeTo?: Date,
  excludeBookingId?: string
) {
  const from = rangeFrom ?? new Date()
  from.setHours(0, 0, 0, 0)
  const to =
    rangeTo ??
    (() => {
      const d = new Date(from)
      d.setMonth(d.getMonth() + 12)
      return d
    })()
  to.setHours(0, 0, 0, 0)

  const [blockedRows, bookings] = await Promise.all([
    prisma.propertyBlockedDate.findMany({
      where: {
        listingId,
        date: { gte: from, lt: to },
      },
      orderBy: { date: "asc" },
    }),
    prisma.propertyBooking.findMany({
      where: {
        listingId,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        checkIn: { lt: to },
        checkOut: { gt: from },
      },
      select: { checkIn: true, checkOut: true, status: true },
      orderBy: { checkIn: "asc" },
    }),
  ])

  const blockedDates = blockedRows.map((b) => dateKey(b.date))
  const bookedRanges = bookings.map((b) => ({
    checkIn: dateKey(b.checkIn),
    checkOut: dateKey(b.checkOut),
    status: b.status,
  }))

  const unavailableSet = new Set<string>(blockedDates)
  for (const b of bookings) {
    for (const night of eachNightInRange(b.checkIn, b.checkOut)) {
      if (night >= dateKey(from) && night < dateKey(to)) {
        unavailableSet.add(night)
      }
    }
  }

  return {
    blockedDates,
    bookedRanges,
    unavailableDates: Array.from(unavailableSet).sort(),
  }
}

export async function isPropertyListingAvailableForRange(
  listingId: string,
  checkIn: Date,
  checkOut: Date
): Promise<{ available: boolean; reason?: string }> {
  try {
    const overlapping = await prisma.propertyBooking.findFirst({
      where: {
        listingId,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
    })
    if (overlapping) {
      return { available: false, reason: "Selected dates are not available" }
    }

    const blocked = await prisma.propertyBlockedDate.findFirst({
      where: {
        listingId,
        date: { gte: checkIn, lt: checkOut },
      },
    })
    if (blocked) {
      return { available: false, reason: "Selected dates include blocked nights" }
    }

    return { available: true }
  } catch {
    return { available: false, reason: "Could not verify availability" }
  }
}
