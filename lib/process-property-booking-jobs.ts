import { prisma } from "@/lib/prisma"
import { releasePropertyEscrow } from "@/lib/property-escrow"
import { NotificationBridge } from "@/lib/notification-bridge"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MIN_MS = 60 * 1000
/** Wider window for day-ahead reminders (worker polls every ~5 min by default). */
const POLL_WINDOW_DAY_MS = 20 * MIN_MS
/** Tighter windows for short-fuse reminders so 10m / 30m alerts are not missed. */
function tierPollWindowMs(tierMs: number): number {
  if (tierMs <= 15 * MIN_MS) return 4 * MIN_MS
  if (tierMs <= 4 * HOUR_MS) return 10 * MIN_MS
  return POLL_WINDOW_DAY_MS
}

/** Default check-in time on calendar date (3 PM) for reminder scheduling. */
function checkInDateTime(checkIn: Date): Date {
  const d = new Date(checkIn)
  d.setHours(15, 0, 0, 0)
  return d
}

async function reminderAlreadySent(userId: string, title: string): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      title,
      module: "PROPERTY",
      createdAt: { gte: new Date(Date.now() - 3 * DAY_MS) },
    },
    select: { id: true },
  })
  return Boolean(existing)
}

async function sendCheckInReminder(
  booking: { id: string; customerId: string; bookingNumber: string; listing?: { title: string | null } | null },
  title: string,
  message: string
) {
  if (await reminderAlreadySent(booking.customerId, title)) return false
  await NotificationBridge.sendNotification({
    userId: booking.customerId,
    title,
    message,
    type: "REMINDER",
    module: "PROPERTY",
    data: { propertyBookingId: booking.id, actionType: "navigate", screen: "BookingDetailsScreen" },
  })
  return true
}

export async function processPropertyBookingScheduledJobs(): Promise<{
  reminders: number
  autoCompleted: number
}> {
  const now = new Date()
  let reminders = 0
  let autoCompleted = 0

  const activeBookings = await prisma.propertyBooking.findMany({
    where: {
      status: { in: ["CONFIRMED", "PENDING_APPROVAL", "ACTIVE", "CHECKED_IN"] },
      paymentStatus: "PAID",
    },
    include: { listing: { select: { title: true } } },
  })

  for (const b of activeBookings) {
    if (["CONFIRMED", "PENDING_APPROVAL"].includes(b.status)) {
      const checkInAt = checkInDateTime(b.checkIn)
      const msUntil = checkInAt.getTime() - now.getTime()
      const bookedWithShortLead =
        checkInAt.getTime() - b.createdAt.getTime() < DAY_MS

      const listingName = b.listing?.title || "your booking"
      const ref = b.bookingNumber

      if (
        !bookedWithShortLead &&
        msUntil >= DAY_MS &&
        msUntil <= DAY_MS + POLL_WINDOW_DAY_MS
      ) {
        const sent = await sendCheckInReminder(
          b,
          `Check-in tomorrow · ${ref}`,
          `Your stay at ${listingName} starts tomorrow. Get ready for check-in after 3:00 PM.`
        )
        if (sent) reminders += 1
      }

      if (msUntil > 0) {
        const tiers: Array<{ ms: number; title: string; message: string }> = [
          {
            ms: 4 * HOUR_MS,
            title: `Check-in in 4 hours · ${ref}`,
            message: `Your stay at ${listingName} begins in about 4 hours.`,
          },
          {
            ms: 3 * HOUR_MS,
            title: `Check-in in 3 hours · ${ref}`,
            message: `Your stay at ${listingName} begins in about 3 hours.`,
          },
          {
            ms: 30 * 60 * 1000,
            title: `Check-in in 30 minutes · ${ref}`,
            message: `Get ready — check-in at ${listingName} is in 30 minutes.`,
          },
          {
            ms: 10 * 60 * 1000,
            title: `Check-in starting soon · ${ref}`,
            message: `Your booking is about to start. Join your host and check in as soon as possible.`,
          },
        ]

        for (const tier of tiers) {
          const diff = Math.abs(msUntil - tier.ms)
          if (diff <= tierPollWindowMs(tier.ms)) {
            const sent = await sendCheckInReminder(b, tier.title, tier.message)
            if (sent) reminders += 1
            break
          }
        }
      }
    }

    if (["ACTIVE", "CHECKED_IN"].includes(b.status)) {
      const checkOutAt = new Date(b.checkOut)
      checkOutAt.setHours(11, 0, 0, 0)
      const msUntilOut = checkOutAt.getTime() - now.getTime()
      if (msUntilOut >= DAY_MS && msUntilOut <= DAY_MS + POLL_WINDOW_DAY_MS) {
        const title = `Check-out tomorrow · ${b.bookingNumber}`
        if (!(await reminderAlreadySent(b.customerId, title))) {
          await NotificationBridge.sendNotification({
            userId: b.customerId,
            title,
            message: `Your stay at ${b.listing?.title || "your booking"} ends tomorrow.`,
            type: "REMINDER",
            module: "PROPERTY",
            data: { propertyBookingId: b.id },
          })
          reminders += 1
        }
      }
    }
  }

  const dueCheckOut = await prisma.propertyBooking.findMany({
    where: {
      status: { in: ["CHECKED_IN", "ACTIVE", "CONFIRMED"] },
      checkOut: { lte: now },
      paymentStatus: "PAID",
    },
  })

  for (const b of dueCheckOut) {
    try {
      if (!b.escrowReleasedAt) {
        await releasePropertyEscrow(b.id)
      } else if (b.status !== "COMPLETED") {
        await prisma.propertyBooking.update({
          where: { id: b.id },
          data: { status: "COMPLETED", checkedOutAt: b.checkedOutAt || new Date() },
        })
      }
      autoCompleted += 1
      const title = `Review your stay · ${b.bookingNumber}`
      if (!(await reminderAlreadySent(b.customerId, title))) {
        await NotificationBridge.sendNotification({
          userId: b.customerId,
          title,
          message: "Your trip has ended. Share your experience with the host.",
          type: "REMINDER",
          module: "PROPERTY",
          data: {
            propertyBookingId: b.id,
            actionType: "navigate",
            screen: "ReviewsSubmissionScreen",
          },
        })
      }
    } catch (e) {
      console.error("[property-booking-jobs] auto-complete failed", b.id, e)
    }
  }

  return { reminders, autoCompleted }
}
