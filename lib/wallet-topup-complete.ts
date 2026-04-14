import { prisma } from '@/lib/prisma'
import { recordPaymentProcessingLedgerIfApplicable } from '@/lib/payment-processing-ledger'

/**
 * Idempotent wallet credit + payment PAID + processing-fee ledger for WALLET_TOPUP payments.
 */
export async function completeWalletTopUp(
  paymentIntentId: string,
  userId: string
): Promise<{ wallet: { id: string; balance: number; currency: string }; transaction: unknown } | null> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentIntentId, userId },
  })

  if (!payment) {
    return null
  }

  const meta = (payment.metadata as Record<string, unknown> | null) || {}
  if (meta.type !== 'WALLET_TOPUP') {
    return null
  }

  const baseAmount = Number(meta.baseAmount ?? payment.amount)
  const creditAmount =
    meta.baseAmount != null ? Number(meta.baseAmount) : Number(payment.amount)

  const existing = await prisma.transaction.findFirst({
    where: {
      userId,
      type: 'WALLET_TOPUP',
      reference: paymentIntentId,
    },
  })
  if (existing) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } })
    return wallet ? { wallet, transaction: existing } : null
  }

  const wallet = await prisma.wallet.findUnique({
    where: { userId },
  })

  if (!wallet) {
    return null
  }

  const updatedWallet = await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      balance: wallet.balance + creditAmount,
    },
  })

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      walletId: wallet.id,
      type: 'WALLET_TOPUP',
      amount: creditAmount,
      currency: payment.currency,
      status: 'COMPLETED',
      description: `Wallet top-up of ${payment.currency} ${creditAmount}`,
      reference: paymentIntentId,
      metadata: {
        paymentIntentId,
        type: 'WALLET_TOPUP',
        baseAmount,
        totalPaid: payment.amount,
        paymentProcessingFee: meta.paymentProcessingFee,
      },
    },
  })

  await prisma.payment.update({
    where: { id: paymentIntentId },
    data: { status: 'PAID' },
  })

  const fee = Number(meta.paymentProcessingFee ?? 0)
  const rate = Number(meta.paymentProcessingRate ?? 0)
  if (fee > 0) {
    await recordPaymentProcessingLedgerIfApplicable({
      paymentId: paymentIntentId,
      userId,
      module: 'WALLET',
      orderAmount: baseAmount,
      feeAmount: fee,
      ratePercent: rate,
      currency: payment.currency,
      gateway: payment.gateway,
    })
  }

  return {
    wallet: updatedWallet,
    transaction,
  }
}
