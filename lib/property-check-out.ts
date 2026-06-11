import { prisma } from "@/lib/prisma"
import { formatBookingRequestRow } from "@/lib/property-types"
import { releasePropertyEscrow } from "@/lib/property-escrow"
import { NotificationBridge } from "@/lib/notification-bridge"
import { emitPropertyBookingSocketEvents } from "@/lib/property-socket-emit"

export async function performPropertyCheckOut(params: {
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
    },
  })

  if (!booking) {
    throw new Error("Booking not found")
  }

  if (!["CHECKED_IN", "ACTIVE"].includes(booking.status)) {
    throw new Error(`Booking cannot be checked out (status: ${booking.status})`)
  }

  if (!booking.escrowReleasedAt) {
    await releasePropertyEscrow(params.bookingId, { checkedOutById: params.hostUserId })
  } else {
    await prisma.propertyBooking.update({
      where: { id: params.bookingId },
      data: {
        status: "COMPLETED",
        checkedOutAt: booking.checkedOutAt || new Date(),
        checkedOutById: params.hostUserId,
      },
    })
  }

  const updated = await prisma.propertyBooking.findUnique({
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

  if (!updated) {
    throw new Error("Booking not found after checkout")
  }

  await NotificationBridge.sendNotification({
    userId: booking.customerId,
    title: "Stay completed",
    message: `Thanks for staying at ${booking.listing?.title || "your booking"}. Leave a review when you can.`,
    type: "REMINDER",
    module: "PROPERTY",
    data: {
      propertyBookingId: booking.id,
      actionType: "navigate",
      screen: "ReviewsSubmissionScreen",
    },
  })

  try {
    await emitPropertyBookingSocketEvents({
      customerId: booking.customerId,
      hostUserId: params.hostUserId,
      vendorId: booking.vendorId,
      payload: {
        bookingId: booking.id,
        status: "COMPLETED",
        checkedIn: false,
        escrowReleased: true,
        guestName: updated.customer?.name,
        listingTitle: updated.listing?.title,
      },
    })
  } catch (e) {
    console.warn("[property-check-out] socket emit failed", e)
  }

  return {
    booking: formatBookingRequestRow(updated),
    escrowReleased: true,
  }
}
