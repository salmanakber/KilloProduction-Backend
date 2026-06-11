import { prisma } from "@/lib/prisma"
import { calculatePropertyQuote, computeVendorEscrowPayout } from "@/lib/property-pricing"
import { createPropertyEscrowHold } from "@/lib/property-escrow"
import { tryCalculateCommissionAmount } from "@/lib/commission-service"
import { Module, CommissionType } from "@prisma/client"
import { NotificationBridge } from "@/lib/notification-bridge"
import { roundMoney2 } from "@/lib/money-round"

export function generatePropertyBookingNumber(): string {
  return `PB${Date.now()}${Math.floor(Math.random() * 1000)}`
}

export async function assertListingAvailable(
  listingId: string,
  checkIn: Date,
  checkOut: Date,
  excludeBookingId?: string
) {
  const overlapping = await prisma.propertyBooking.findFirst({
    where: {
      listingId,
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
      status: {
        in: [
          "PENDING_PAYMENT",
          "PENDING_APPROVAL",
          "CONFIRMED",
          "CHECKED_IN",
          "ACTIVE",
        ],
      },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
  })
  if (overlapping) {
    throw new Error("Selected dates are not available")
  }

  const blocked = await prisma.propertyBlockedDate.findFirst({
    where: {
      listingId,
      date: { gte: checkIn, lt: checkOut },
    },
  })
  if (blocked) {
    throw new Error("Selected dates include blocked nights")
  }
}

export async function applyPropertyPaymentSuccess(params: {
  bookingId: string
  paymentData: any
  paymentMethod?: string
}) {
  const booking = await prisma.propertyBooking.findUnique({
    where: { id: params.bookingId },
    include: { listing: true, customer: { select: { id: true, name: true } } },
  })
  if (!booking) throw new Error("Booking not found")

  const orderBase = roundMoney2(booking.subtotal + booking.cleaningFee)
  const vendorCommission = await tryCalculateCommissionAmount(
    Module.PROPERTY,
    orderBase,
    CommissionType.VENDOR_COMMISSION
  )
  const vendorPayout = computeVendorEscrowPayout(
    booking.subtotal,
    booking.cleaningFee,
    vendorCommission
  )

  const nextStatus = booking.listing?.requiresApproval ? "PENDING_APPROVAL" : "CONFIRMED"

  await prisma.$transaction(async (tx) => {
    await tx.propertyBooking.update({
      where: { id: booking.id },
      data: {
        status: nextStatus,
        paymentStatus: "PAID",
        paymentMethod: params.paymentMethod || params.paymentData?.paymentMethod || "CARD",
      },
    })

    if (params.paymentData?.paymentId) {
      await tx.payment.update({
        where: { id: params.paymentData.paymentId },
        data: {
          status: "PAID",
          metadata: {
            ...(params.paymentData as object),
            propertyBookingId: booking.id,
            escrow: "HELD",
          },
        },
      })
    } else if (params.paymentData?.id || params.paymentData?.transactionId) {
      await tx.payment.create({
        data: {
          userId: booking.customerId,
          amount: booking.totalAmount,
          currency: params.paymentData.currency || "NGN",
          status: "PAID",
          gateway: params.paymentData.gateway || "STRIPE",
          gatewayTransactionId:
            params.paymentData.id || params.paymentData.transactionId || undefined,
          description: `Property booking ${booking.bookingNumber}`,
          metadata: {
            propertyBookingId: booking.id,
            bookingNumber: booking.bookingNumber,
            escrow: "HELD",
            ...params.paymentData,
          },
        },
      })
    }

    if (
      (params.paymentData?.paymentMethod === "WALLET" ||
        params.paymentData?.paymentMethod === "wallet") &&
      params.paymentData?.walletTransaction?.id
    ) {
      await tx.walletTransaction.update({
        where: { id: params.paymentData.walletTransaction.id },
        data: { status: "COMPLETED" },
      })
    }
  })

  await createPropertyEscrowHold({
    bookingId: booking.id,
    vendorId: booking.vendorId,
    vendorPayoutAmount: vendorPayout,
    bookingNumber: booking.bookingNumber,
  })

  await NotificationBridge.sendNotification({
    userId: booking.vendorId,
    title: "New booking request",
    message: `${booking.customer?.name || "A guest"} booked ${booking.listing?.title || "your property"}.`,
    type: "ORDER",
    module: "PROPERTY",
    data: {
      propertyBookingId: booking.id,
      actionType: "navigate",
      screen: "BookingRequestsScreen",
    },
  })

  await NotificationBridge.sendNotification({
    userId: booking.customerId,
    title: "Booking confirmed",
    message: `Your stay at ${booking.listing?.title || "the property"} is ${nextStatus === "PENDING_APPROVAL" ? "awaiting host approval" : "confirmed"}.`,
    type: "ORDER",
    module: "PROPERTY",
    data: { propertyBookingId: booking.id, actionType: "navigate", screen: "BookingDetailsScreen" },
  })

  return { nextStatus, vendorPayout }
}
