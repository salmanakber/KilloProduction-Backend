import { prisma } from '@/lib/prisma'
import type { Module } from '@prisma/client'

export async function recordPaymentProcessingLedgerIfApplicable(params: {
  paymentId: string
  userId: string
  module: Module
  /** Amount the fee was computed from (typically subtotal before processing fee). */
  orderAmount: number
  feeAmount: number
  ratePercent: number
  currency: string
  gateway: string
}) {
  const { paymentId, userId, module, orderAmount, feeAmount, ratePercent, currency, gateway } = params
  if (!Number.isFinite(feeAmount) || feeAmount <= 0) return null

  const existing = await prisma.paymentProcessingLedger.findUnique({
    where: { paymentId },
  })
  if (existing) return existing

  return prisma.paymentProcessingLedger.create({
    data: {
      paymentId,
      userId,
      module,
      orderAmount,
      commissionRate: ratePercent,
      commissionAmount: feeAmount,
      currency,
      gateway,
    },
  })
}
