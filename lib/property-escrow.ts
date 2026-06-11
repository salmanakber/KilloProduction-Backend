import { Module, CommissionType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  calculateCommission,
  createVendorCommission,
  markCommissionAsPaid,
} from "@/lib/commission-service"
import { createWalletTransaction, completeWalletTransaction } from "@/lib/wallet-transaction-service"
import { computeVendorEscrowPayout } from "@/lib/property-pricing"
import { roundMoney2 } from "@/lib/money-round"
import { NotificationBridge } from "@/lib/notification-bridge"

const ESCROW_META_TYPE = "PROPERTY_ESCROW"
const DEPOSIT_REFUND_META_TYPE = "PROPERTY_DEPOSIT_REFUND"

export async function refundPropertySecurityDeposit(bookingId: string) {
  const booking = await prisma.propertyBooking.findUnique({ where: { id: bookingId } })
  if (!booking) throw new Error("Booking not found")
  if (booking.securityDepositRefundedAt) return { alreadyRefunded: true, amount: 0 }

  const depositAmount = roundMoney2(Number(booking.securityDeposit || 0))
  if (depositAmount <= 0) return { alreadyRefunded: false, amount: 0 }

  const existing = await prisma.walletTransaction.findFirst({
    where: {
      userId: booking.customerId,
      reference: `PROPERTY_DEPOSIT_${booking.id}`,
    },
  })
  if (existing) {
    await prisma.propertyBooking.update({
      where: { id: bookingId },
      data: { securityDepositRefundedAt: existing.createdAt },
    })
    return { alreadyRefunded: true, amount: depositAmount }
  }

  await prisma.$transaction(async (tx) => {
    const customerWallet = await tx.wallet.upsert({
      where: { userId: booking.customerId },
      update: {},
      create: { userId: booking.customerId, balance: 0, currency: "NGN" },
    })
    const newBalance = roundMoney2(customerWallet.balance + depositAmount)
    await tx.wallet.update({
      where: { id: customerWallet.id },
      data: { balance: newBalance },
    })
    await tx.walletTransaction.create({
      data: {
        userId: booking.customerId,
        type: "CREDIT",
        amount: depositAmount,
        balance: newBalance,
        description: `Security deposit returned for booking ${booking.bookingNumber}`,
        reference: `PROPERTY_DEPOSIT_${booking.id}`,
        status: "COMPLETED",
        metadata: {
          module: Module.PROPERTY,
          transactionType: DEPOSIT_REFUND_META_TYPE,
          propertyBookingId: booking.id,
          bookingNumber: booking.bookingNumber,
        },
      },
    })
    await tx.propertyBooking.update({
      where: { id: bookingId },
      data: { securityDepositRefundedAt: new Date() },
    })
  })

  await NotificationBridge.sendNotification({
    userId: booking.customerId,
    title: "Security deposit returned",
    message: `Your security deposit of ₦${depositAmount.toLocaleString()} for booking ${booking.bookingNumber} has been credited to your wallet.`,
    type: "PAYMENT",
    module: "PROPERTY",
    data: {
      propertyBookingId: bookingId,
      actionType: "navigate",
      screen: "BookingHistoryScreen",
    },
  })

  return { alreadyRefunded: false, amount: depositAmount }
}

export async function createPropertyEscrowHold(params: {
  bookingId: string
  vendorId: string
  vendorPayoutAmount: number
  bookingNumber: string
}) {
  return createWalletTransaction({
    userId: params.vendorId,
    type: "CREDIT",
    amount: params.vendorPayoutAmount,
    description: `Escrow hold for property booking ${params.bookingNumber}`,
    status: "PENDING",
    metadata: {
      module: Module.PROPERTY,
      transactionType: ESCROW_META_TYPE,
      propertyBookingId: params.bookingId,
    },
  })
}

export async function releasePropertyEscrow(
  bookingId: string,
  options?: { checkedOutById?: string }
) {
  const booking = await prisma.propertyBooking.findUnique({
    where: { id: bookingId },
    include: { listing: true },
  })
  if (!booking) throw new Error("Booking not found")
  if (booking.escrowReleasedAt) return { alreadyReleased: true }

  const orderBase = roundMoney2(booking.subtotal + booking.cleaningFee)
  let vendorCommissionAmount = 0
  try {
    const calc = await calculateCommission(
      Module.PROPERTY,
      orderBase,
      CommissionType.VENDOR_COMMISSION
    )
    vendorCommissionAmount = calc.commissionAmount
  } catch {
    vendorCommissionAmount = 0
  }

  const vendorPayout = computeVendorEscrowPayout(
    booking.subtotal,
    booking.cleaningFee,
    vendorCommissionAmount
  )

  const pendingTx = await prisma.walletTransaction.findMany({
    where: {
      userId: booking.vendorId,
      status: "PENDING",
    },
  })

  const escrowTx = pendingTx.find((tx) => {
    const meta = tx.metadata as { propertyBookingId?: string; transactionType?: string } | null
    return meta?.propertyBookingId === bookingId && meta?.transactionType === ESCROW_META_TYPE
  })

  if (escrowTx) {
    if (Math.abs(escrowTx.amount - vendorPayout) > 0.02) {
      await prisma.walletTransaction.update({
        where: { id: escrowTx.id },
        data: { amount: vendorPayout },
      })
    }
    await completeWalletTransaction(escrowTx.id)
  } else {
    await createPropertyEscrowHold({
      bookingId,
      vendorId: booking.vendorId,
      vendorPayoutAmount: vendorPayout,
      bookingNumber: booking.bookingNumber,
    })
    const created = await prisma.walletTransaction.findFirst({
      where: { userId: booking.vendorId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    })
    if (created) await completeWalletTransaction(created.id)
  }

  if (vendorCommissionAmount > 0) {
    const existing = await prisma.vendorCommission.findFirst({
      where: { propertyBookingId: bookingId, commissionType: CommissionType.VENDOR_COMMISSION },
    })
    if (!existing) {
      const commission = await createVendorCommission({
        module: Module.PROPERTY,
        vendorId: booking.vendorId,
        orderAmount: orderBase,
        commissionType: CommissionType.VENDOR_COMMISSION,
        status: "PAID",
        propertyBookingId: bookingId,
      })
      if (commission?.id) await markCommissionAsPaid(commission.id, "VENDOR")
    }
  }

  await prisma.propertyBooking.update({
    where: { id: bookingId },
    data: {
      escrowReleasedAt: new Date(),
      status: "COMPLETED",
      checkedOutAt: booking.checkedOutAt || new Date(),
      ...(options?.checkedOutById ? { checkedOutById: options.checkedOutById } : {}),
    },
  })

  await NotificationBridge.sendNotification({
    userId: booking.vendorId,
    title: "Escrow released",
    message: `Payout for booking ${booking.bookingNumber} is now available in your wallet.`,
    type: "PAYMENT",
    module: "PROPERTY",
    data: { propertyBookingId: bookingId, actionType: "navigate", screen: "GlobalEarnings" },
  })

  await NotificationBridge.sendNotification({
    userId: booking.vendorId,
    title: "Booking completed",
    message: `Stay ${booking.bookingNumber} is complete. Earnings are available in your wallet.`,
    type: "ORDER",
    module: "PROPERTY",
    data: { propertyBookingId: bookingId },
  })

  let depositRefundAmount = 0
  try {
    const depositResult = await refundPropertySecurityDeposit(bookingId)
    depositRefundAmount = depositResult.amount || 0
  } catch (e) {
    console.warn("[property-escrow] security deposit refund failed", e)
  }

  return { vendorPayout, vendorCommissionAmount, depositRefundAmount }
}

async function findPropertyBookingPayment(customerId: string, bookingId: string) {
  const payments = await prisma.payment.findMany({
    where: { userId: customerId, status: { in: ["PAID", "COMPLETED"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return (
    payments.find((p) => {
      const meta = p.metadata as { propertyBookingId?: string } | null
      return meta?.propertyBookingId === bookingId
    }) || null
  )
}

export async function refundPropertyBookingPayment(bookingId: string) {
  const booking = await prisma.propertyBooking.findUnique({ where: { id: bookingId } })
  if (!booking || booking.paymentStatus !== "PAID") {
    return { refunded: false }
  }

  const payment = await findPropertyBookingPayment(booking.customerId, bookingId)
  const refundAmount = roundMoney2(booking.totalAmount)

  await prisma.$transaction(async (tx) => {
    const customerWallet = await tx.wallet.upsert({
      where: { userId: booking.customerId },
      update: {},
      create: { userId: booking.customerId, balance: 0, currency: "NGN" },
    })
    const newBalance = customerWallet.balance + refundAmount
    await tx.wallet.update({
      where: { id: customerWallet.id },
      data: { balance: newBalance },
    })
    await tx.walletTransaction.create({
      data: {
        userId: booking.customerId,
        type: "REFUND",
        amount: refundAmount,
        balance: newBalance,
        description: `Refund for property booking ${booking.bookingNumber}`,
        reference: `PROPERTY_REFUND_${booking.id}`,
        status: "COMPLETED",
        metadata: {
          module: Module.PROPERTY,
          propertyBookingId: booking.id,
          bookingNumber: booking.bookingNumber,
        },
      },
    })

    if (payment) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REFUNDED",
          metadata: {
            ...(payment.metadata as object),
            propertyBookingId: booking.id,
            refund: {
              amount: refundAmount,
              processedAt: new Date().toISOString(),
              method: "WALLET",
            },
          },
        },
      })
    }

    await tx.propertyBooking.update({
      where: { id: bookingId },
      data: { paymentStatus: "REFUNDED" },
    })
  })

  await NotificationBridge.sendNotification({
    userId: booking.customerId,
    title: "Refund processed",
    message: `Your refund of ₦${refundAmount.toLocaleString()} for booking ${booking.bookingNumber} has been credited to your wallet.`,
    type: "PAYMENT",
    module: "PROPERTY",
    data: { propertyBookingId: bookingId, actionType: "navigate", screen: "BookingHistoryScreen" },
  })

  return { refunded: true, refundAmount }
}

export async function cancelPropertyEscrow(
  bookingId: string,
  reason?: string,
  options?: { finalStatus?: "REJECTED" | "CANCELLED" | "REFUNDED" }
) {
  const booking = await prisma.propertyBooking.findUnique({ where: { id: bookingId } })
  if (!booking) throw new Error("Booking not found")

  const pendingTx = await prisma.walletTransaction.findMany({
    where: { userId: booking.vendorId, status: "PENDING" },
  })
  for (const tx of pendingTx) {
    const meta = tx.metadata as { propertyBookingId?: string; transactionType?: string } | null
    if (meta?.propertyBookingId === bookingId && meta?.transactionType === ESCROW_META_TYPE) {
      await prisma.walletTransaction.update({
        where: { id: tx.id },
        data: {
          status: "CANCELLED",
          description: `${tx.description} (cancelled${reason ? `: ${reason}` : ""})`,
        },
      })
    }
  }

  let refunded = false
  if (booking.paymentStatus === "PAID") {
    const result = await refundPropertyBookingPayment(bookingId)
    refunded = result.refunded
  }

  const finalStatus =
    options?.finalStatus ||
    (refunded ? "REFUNDED" : booking.paymentStatus === "PAID" ? "CANCELLED" : "CANCELLED")

  await prisma.propertyBooking.update({
    where: { id: bookingId },
    data: {
      status: finalStatus,
      cancelledAt: new Date(),
      cancelReason: reason || null,
    },
  })

  return { refunded, finalStatus }
}
