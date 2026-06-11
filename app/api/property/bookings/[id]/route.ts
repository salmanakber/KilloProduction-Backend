import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { formatBookingRequestRow } from "@/lib/property-types"
import {
  canRevealListingAccessForBooking,
  pickListingAccessFields,
} from "@/lib/property-listing-host-stats"
import { cancelPropertyEscrow } from "@/lib/property-escrow"
import { NotificationBridge } from "@/lib/notification-bridge"
import {
  assertCanManageHostBookings,
  getPropertyHostContext,
  resolvePropertyHostVendorId,
} from "@/lib/property-host-resolve"
import { assertListingAvailable } from "@/lib/property-booking-service"
import { calculatePropertyQuote } from "@/lib/property-pricing"
import { performPropertyCheckIn } from "@/lib/property-check-in"
import { performPropertyCheckOut } from "@/lib/property-check-out"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const booking = await prisma.propertyBooking.findUnique({
      where: { id: params.id },
      include: {
        listing: {
          include: { vendor: { select: { id: true, name: true, avatar: true, phone: true } } },
        },
        customer: { select: { id: true, name: true, avatar: true, phone: true } },
        vendor: { select: { id: true, name: true, avatar: true, phone: true } },
        approvedBy: { select: { id: true, name: true, avatar: true } },
        rejectedBy: { select: { id: true, name: true, avatar: true } },
        checkedInBy: { select: { id: true, name: true, avatar: true } },
        checkedOutBy: { select: { id: true, name: true, avatar: true } },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    const hostVendorId = await resolvePropertyHostVendorId(user.id)
    const canAccess =
      booking.customerId === user.id ||
      booking.vendorId === user.id ||
      (hostVendorId && booking.vendorId === hostVendorId)
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const revealAccess =
      (booking.customerId === user.id && canRevealListingAccessForBooking(booking)) ||
      (hostVendorId && booking.vendorId === hostVendorId)

    const listingPayload = booking.listing
      ? {
          id: booking.listing.id,
          title: booking.listing.title,
          tagline: booking.listing.tagline,
          city: booking.listing.city,
          address: booking.listing.address,
          images: booking.listing.images,
          image: (booking.listing.images as string[])?.[0] || null,
          ...(revealAccess ? pickListingAccessFields(booking.listing) : {}),
        }
      : null

    const existingReview =
      booking.customerId === user.id
        ? await prisma.propertyReview.findUnique({
            where: { bookingId: booking.id },
            select: { id: true, rating: true, comment: true, createdAt: true },
          })
        : null

    return NextResponse.json({
      success: true,
      booking: {
        ...formatBookingRequestRow(booking),
        listing: listingPayload,
        customer: booking.customer,
        vendor: booking.vendor,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        paymentReferenceNumber: booking.bookingNumber,
        platformFee: booking.platformFee,
        subtotal: booking.subtotal,
        cleaningFee: booking.cleaningFee,
        securityDeposit: booking.securityDeposit,
        totalAmount: booking.totalAmount,
        guestIdentity: booking.guestIdentity,
        hasReview: Boolean(existingReview),
        review: existingReview,
      },
    })
  } catch (error) {
    console.error("Property booking GET error:", error)
    return NextResponse.json({ error: "Failed to fetch booking" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action, reason, checkIn, checkOut } = await request.json()
    const booking = await prisma.propertyBooking.findUnique({
      where: { id: params.id },
      include: { listing: { select: { title: true } }, customer: { select: { name: true } } },
    })
    if (!booking) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    if (action === "approve" || action === "reject" || action === "check-in" || action === "check-out") {
      const { ctx: hostCtx, denied } = await assertCanManageHostBookings(user.id)
      if (denied || !hostCtx) {
        return NextResponse.json({ error: "Not authorized to manage host bookings" }, { status: 403 })
      }
      if (booking.vendorId !== hostCtx.hostVendorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else if (action === "cancel" || action === "reschedule") {
      if (booking.customerId !== user.id && booking.vendorId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      if (action === "reschedule" && booking.customerId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    if (action === "approve") {
      if (booking.status !== "PENDING_APPROVAL") {
        return NextResponse.json({ error: "Booking is not pending approval" }, { status: 400 })
      }
      await prisma.propertyBooking.update({
        where: { id: params.id },
        data: { status: "CONFIRMED", approvedById: user.id, approvedAt: new Date() },
      })
      await NotificationBridge.sendNotification({
        userId: booking.customerId,
        title: "Booking confirmed",
        message: `Your stay at ${booking.listing?.title || "the property"} is confirmed.`,
        type: "ORDER",
        module: "PROPERTY",
        data: { propertyBookingId: booking.id, actionType: "navigate", screen: "BookingDetailsScreen" },
      })
    } else if (action === "reject") {
      await prisma.propertyBooking.update({
        where: { id: params.id },
        data: { rejectedById: user.id, rejectedAt: new Date() },
      })
      await cancelPropertyEscrow(params.id, reason || "Rejected by host", {
        finalStatus: booking.paymentStatus === "PAID" ? "REFUNDED" : "REJECTED",
      })
      await NotificationBridge.sendNotification({
        userId: booking.customerId,
        title: "Booking declined",
        message: `Your request for ${booking.listing?.title || "the property"} was declined.`,
        type: "ORDER",
        module: "PROPERTY",
        data: { propertyBookingId: booking.id },
      })
    } else if (action === "check-in") {
      await performPropertyCheckIn({ bookingId: params.id, hostUserId: user.id })
    } else if (action === "reschedule") {
      if (!["CONFIRMED", "PENDING_APPROVAL"].includes(booking.status)) {
        return NextResponse.json(
          { error: "Only upcoming confirmed bookings can be rescheduled" },
          { status: 400 }
        )
      }
      if (!checkIn || !checkOut) {
        return NextResponse.json({ error: "checkIn and checkOut are required" }, { status: 400 })
      }
      const checkInDate = new Date(checkIn)
      const checkOutDate = new Date(checkOut)
      if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
        return NextResponse.json({ error: "Invalid dates" }, { status: 400 })
      }
      if (checkOutDate <= checkInDate) {
        return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 })
      }
      const nights = Math.max(
        1,
        Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000)
      )
      await assertListingAvailable(
        booking.listingId,
        checkInDate,
        checkOutDate,
        params.id
      )
      const listing = await prisma.propertyListing.findUnique({
        where: { id: booking.listingId },
      })
      if (!listing) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 })
      }
      const quote = await calculatePropertyQuote({
        nightlyRate: listing.nightlyRate,
        discountPercent: listing.discountPercent,
        cleaningFee: listing.cleaningFee,
        securityDeposit: listing.securityDeposit,
        nights,
      })
      await prisma.propertyBooking.update({
        where: { id: params.id },
        data: {
          checkIn: checkInDate,
          checkOut: checkOutDate,
          nights,
          subtotal: quote.subtotal,
          cleaningFee: quote.cleaningFee,
          securityDeposit: quote.securityDeposit,
          platformFee: quote.platformFee,
          totalAmount: quote.totalAmount,
        },
      })
      await NotificationBridge.sendNotification({
        userId: booking.vendorId,
        title: "Booking dates updated",
        message: `Guest rescheduled ${booking.bookingNumber} to ${checkInDate.toLocaleDateString()} – ${checkOutDate.toLocaleDateString()}.`,
        type: "ORDER",
        module: "PROPERTY",
        data: { propertyBookingId: booking.id },
      })
      try {
        const { emitPropertyBookingSocketEvents } = await import("@/lib/property-socket-emit")
        await emitPropertyBookingSocketEvents({
          customerId: booking.customerId,
          hostUserId: booking.vendorId,
          vendorId: booking.vendorId,
          payload: {
            bookingId: booking.id,
            status: booking.status,
            rescheduled: true,
            checkIn: checkInDate.toISOString().slice(0, 10),
            checkOut: checkOutDate.toISOString().slice(0, 10),
          },
        })
      } catch {
        // non-fatal
      }
    } else if (action === "check-out" || action === "complete") {
      await performPropertyCheckOut({ bookingId: params.id, hostUserId: user.id })
    } else if (action === "cancel") {
      const wasPaid = booking.paymentStatus === "PAID"
      await cancelPropertyEscrow(params.id, reason || "Cancelled", {
        finalStatus: wasPaid ? "REFUNDED" : "CANCELLED",
      })
      await NotificationBridge.sendNotification({
        userId: booking.vendorId,
        title: "Booking cancelled",
        message: `Booking ${booking.bookingNumber} was cancelled.`,
        type: "ORDER",
        module: "PROPERTY",
        data: { propertyBookingId: booking.id },
      })
      if (booking.customerId !== user.id) {
        await NotificationBridge.sendNotification({
          userId: booking.customerId,
          title: wasPaid ? "Booking cancelled" : "Booking cancelled",
          message: wasPaid
            ? `Your booking ${booking.bookingNumber} was cancelled. Refund has been processed if applicable.`
            : `Your booking ${booking.bookingNumber} was cancelled.`,
          type: "ORDER",
          module: "PROPERTY",
          data: { propertyBookingId: booking.id },
        })
      }
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const updated = await prisma.propertyBooking.findUnique({ where: { id: params.id } })
    return NextResponse.json({ success: true, booking: updated })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update booking" },
      { status: 400 }
    )
  }
}
