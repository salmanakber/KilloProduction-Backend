import { prisma } from "@/lib/prisma"
import { formatBookingRequestRow } from "@/lib/property-types"
import { NotificationBridge } from "@/lib/notification-bridge"
import { emitPropertyBookingSocketEvents } from "@/lib/property-socket-emit"

function startOfCalendarDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export async function performPropertyCheckIn(params: {
  bookingId: string
  hostUserId: string
}) {
  const booking = await prisma.propertyBooking.findUnique({
    where: { id: params.bookingId },
    include: {
      customer: { select: { id: true, name: true, avatar: true } },
      listing: { select: { title: true } },
      approvedBy: { select: { id: true, name: true, avatar: true } },
      rejectedBy: { select: { id: true, name: true, avatar: true } },
      checkedInBy: { select: { id: true, name: true, avatar: true } },
      checkedOutBy: { select: { id: true, name: true, avatar: true } },
    },
  })

  if (!booking) {
    throw new Error("Booking not found")
  }

  if (!["CONFIRMED", "CHECKED_IN", "ACTIVE"].includes(booking.status)) {
    throw new Error(`Booking cannot be checked in (status: ${booking.status})`)
  }

  const today = startOfCalendarDay(new Date())
  const checkInDay = startOfCalendarDay(booking.checkIn)
  if (today < checkInDay) {
    const label = checkInDay.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    throw new Error(`Check-in opens on ${label}. This guest cannot check in early.`)
  }

  const alreadyCheckedIn =
    (booking.status === "CHECKED_IN" || booking.status === "ACTIVE") && booking.checkedInAt

  const updated = await prisma.propertyBooking.update({
    where: { id: booking.id },
    data: {
      status: "CHECKED_IN",
      checkedInAt: booking.checkedInAt || new Date(),
      checkedInById: params.hostUserId,
    },
    include: {
      customer: { select: { id: true, name: true, avatar: true } },
      listing: { select: { title: true } },
      approvedBy: { select: { id: true, name: true, avatar: true } },
      rejectedBy: { select: { id: true, name: true, avatar: true } },
      checkedInBy: { select: { id: true, name: true, avatar: true } },
      checkedOutBy: { select: { id: true, name: true, avatar: true } },
    },
  })

  if (!alreadyCheckedIn) {
    await NotificationBridge.sendNotification({
      userId: booking.customerId,
      title: "You're checked in",
      message: `Welcome! Your stay at ${booking.listing?.title || "your booking"} has started.`,
      type: "ORDER",
      module: "PROPERTY",
      data: {
        propertyBookingId: booking.id,
        actionType: "navigate",
        screen: "BookingDetailsScreen",
        status: "CHECKED_IN",
        checkedIn: true,
      },
    })

    const socketPayload = {
      bookingId: booking.id,
      status: "CHECKED_IN",
      checkedIn: true,
      escrowReleased: false,
      guestName: updated.customer?.name,
      listingTitle: updated.listing?.title,
    }

    try {
      await emitPropertyBookingSocketEvents({
        customerId: booking.customerId,
        hostUserId: params.hostUserId,
        vendorId: booking.vendorId,
        payload: socketPayload,
      })
    } catch (e) {
      console.warn("[property-check-in] socket emit failed", e)
    }
  }

  return {
    booking: formatBookingRequestRow(updated),
    guestName: updated.customer?.name,
    listingTitle: updated.listing?.title,
    alreadyCheckedIn: Boolean(alreadyCheckedIn),
  }
}
