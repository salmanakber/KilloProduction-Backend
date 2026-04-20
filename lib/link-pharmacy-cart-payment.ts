import { prisma } from "@/lib/prisma"
import { recordPaymentProcessingLedgerIfApplicable } from "@/lib/payment-processing-ledger"
import type { Module } from "@prisma/client"

/**
 * After the Prisma order exists, attach the card payment row created at checkout time
 * (`resolvePendingCheckoutPayment`) so `Payment.orderId` is the real order id, not a cart placeholder.
 */
export async function linkPharmacyCartPaymentToOrder(params: {
  userId: string
  order: { id: string; orderNumber: string; total: number }
  paymentData: Record<string, unknown>
}) {
  const { userId, order, paymentData } = params
  const paymentId =
    (typeof paymentData.prismaPaymentId === "string" && paymentData.prismaPaymentId) ||
    (typeof paymentData.paymentId === "string" && paymentData.paymentId) ||
    null
  if (!paymentId) return

  const pay = await prisma.payment.findFirst({
    where: { id: paymentId, userId },
  })
  if (!pay) {
    console.warn("linkPharmacyCartPaymentToOrder: payment not found", paymentId)
    return
  }

  const meta = (pay.metadata as Record<string, unknown>) || {}
  const processingFee = Number(meta.paymentProcessingFee ?? 0) || 0
  const expectedCharge = Math.round((order.total + processingFee) * 100) / 100
  const diff = Math.abs(Number(pay.amount) - expectedCharge)
  if (diff > 0.08 && diff / Math.max(expectedCharge, 1) > 0.015) {
    console.warn("linkPharmacyCartPaymentToOrder: amount mismatch", {
      paymentAmount: pay.amount,
      expectedCharge,
      orderId: order.id,
    })
  }

  await prisma.payment.update({
    where: { id: pay.id },
    data: {
      orderId: order.id,
      status: "PAID",
      metadata: {
        ...meta,
        orderNumber: order.orderNumber,
        checkoutLinkedAt: new Date().toISOString(),
      } as object,
    },
  })

  await prisma.order.updateMany({
    where: { OR: [{ id: order.id }, { childId: order.id }] },
    data: { paymentStatus: "PAID" },
  })

  const module = meta.module as Module | undefined
  if (module && processingFee > 0) {
    await recordPaymentProcessingLedgerIfApplicable({
      paymentId: pay.id,
      userId,
      module,
      orderAmount: Number(meta.commissionBaseAmount ?? order.total),
      feeAmount: processingFee,
      ratePercent: Number(meta.paymentProcessingRate ?? 0),
      currency: pay.currency,
      gateway: pay.gateway,
    })
  }
}
