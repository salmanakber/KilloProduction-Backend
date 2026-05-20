import { MoneyTransferStatus, Prisma } from "@prisma/client"
import Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { logMoneyTransferAdminAction, MONEY_TRANSFER_AUDIT_ENTITY } from "@/lib/money-transfer-admin"
import { fetchPaystackTransaction } from "@/lib/money-transfer-paystack-admin"

function round2(n: number) {
  return Number(Number(n).toFixed(2))
}

async function getStripeForMoneyModule(): Promise<Stripe | null> {
  const config = await prisma.moneyTransferConfig.findFirst({
    select: { stripeSecretKey: true },
  })
  const key = config?.stripeSecretKey || process.env.MONEY_TRANSFER_STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { apiVersion: "2023-10-16" })
}

/**
 * Admin-initiated refund: reverse wallet credit if applicable, attempt Stripe refund, mark transfer REFUNDED.
 */
export async function processMoneyTransferAdminRefund(args: {
  transferId: string
  adminId: string
  reason: string
  reverseWallet?: boolean
  stripeRefund?: boolean
  ipAddress?: string | null
  userAgent?: string | null
}) {
  const transfer = await prisma.moneyTransfer.findUnique({
    where: { id: args.transferId },
    include: {
      payout: true,
      walletTransactions: { where: { type: "CREDIT" }, take: 1 },
      sender: { select: { id: true, email: true, name: true } },
      receiver: { select: { id: true, email: true, name: true } },
    },
  })

  if (!transfer) {
    throw new Error("Transfer not found")
  }

  if (transfer.status === "REFUNDED") {
    throw new Error("Transfer is already refunded")
  }

  if (!["COMPLETED", "SENT", "PROCESSING", "FAILED"].includes(transfer.status)) {
    throw new Error(`Cannot refund transfer in status ${transfer.status}`)
  }

  const meta = (transfer.metadata as Record<string, unknown>) || {}
  const results: Record<string, unknown> = { reason: args.reason }

  if (args.reverseWallet !== false && transfer.walletTransactions.length > 0) {
    const credit = transfer.walletTransactions[0]
    const settlementCurrency = credit.currency
    const amount = credit.amount

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.moneyTransferWallet.findUnique({
        where: {
          userId_currency: {
            userId: transfer.receiverId,
            currency: settlementCurrency,
          },
        },
      })
      if (!wallet || wallet.balance < amount) {
        throw new Error(
          `Insufficient ${settlementCurrency} wallet balance to reverse credit (${wallet?.balance ?? 0} < ${amount})`,
        )
      }
      const newBalance = round2(wallet.balance - amount)
      await tx.moneyTransferWalletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: transfer.receiverId,
          type: "ADJUSTMENT",
          amount,
          balanceAfter: newBalance,
          currency: settlementCurrency,
          description: `Admin refund reversal — ${transfer.reference}`,
          reference: `MTW_REFUND_${transfer.id}`,
          transferId: transfer.id,
          metadata: { adminId: args.adminId, reason: args.reason } as Prisma.InputJsonValue,
        },
      })
      await tx.moneyTransferWallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      })
    })
    results.walletReversed = true
    results.walletAmount = amount
    results.walletCurrency = settlementCurrency
  }

  if (args.stripeRefund !== false && transfer.stripePaymentIntentId) {
    const stripe = await getStripeForMoneyModule()
    if (!stripe) {
      throw new Error("Stripe not configured for money transfer module")
    }
    const refund = await stripe.refunds.create({
      payment_intent: transfer.stripePaymentIntentId,
      reason: "requested_by_customer",
      metadata: {
        transferId: transfer.id,
        reference: transfer.reference,
        adminId: args.adminId,
      },
    })
    results.stripeRefundId = refund.id
    results.stripeStatus = refund.status
  }

  const paystackRef =
    typeof meta.paystackReference === "string"
      ? meta.paystackReference
      : transfer.payout?.paystackReference

  if (paystackRef && !transfer.stripePaymentIntentId) {
    try {
      const verified = await fetchPaystackTransaction(paystackRef)
      results.paystackPayment = {
        status: verified.status,
        amount: verified.amount,
        currency: verified.currency,
      }
      results.paystackNote =
        "Paystack inbound payment verified. Process Paystack refund manually in dashboard if required."
    } catch (e) {
      results.paystackVerifyError = e instanceof Error ? e.message : "verify failed"
    }
  }

  const updated = await prisma.moneyTransfer.update({
    where: { id: transfer.id },
    data: {
      status: MoneyTransferStatus.REFUNDED,
      metadata: {
        ...meta,
        adminRefund: {
          at: new Date().toISOString(),
          by: args.adminId,
          reason: args.reason,
          results,
        },
      } as Prisma.InputJsonValue,
    },
  })

  await logMoneyTransferAdminAction({
    performedBy: args.adminId,
    action: "MONEY_TRANSFER_REFUND",
    entityType: MONEY_TRANSFER_AUDIT_ENTITY,
    entityId: transfer.id,
    details: { reference: transfer.reference, results },
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
  })

  return { transfer: updated, results }
}
