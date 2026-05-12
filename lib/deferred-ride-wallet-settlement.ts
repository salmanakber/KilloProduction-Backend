import { prisma } from "@/lib/prisma"
import { checkoutPlatformFeeAmount } from "@/lib/commission-service"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type DeferredRideWalletMetadata = Record<string, unknown>

/**
 * One completion-time debit for deferred WALLET rides (no upfront charge at booking).
 * Idempotent via `completionDebitReference` on wallet_transactions.reference.
 */
export async function debitDeferredCustomerRideWallet(params: {
  customerId: string
  paymentMethod: string | null | undefined
  paymentStatus: string | null | undefined
  /** Fare before platform fee (e.g. finalFare or estimatedFare). */
  fareToCharge: number
  completionDebitReference: string
  /** Stored on wallet row for traceability; not required to be an Order id. */
  linkedRecordId?: string | null
  description: string
  metadata: DeferredRideWalletMetadata
}): Promise<void> {
  const isWallet = String(params.paymentMethod || "").toUpperCase() === "WALLET"
  if (!isWallet || String(params.paymentStatus || "").toUpperCase() === "PAID") {
    return
  }

  const existingWalletTx = await prisma.walletTransaction.findFirst({
    where: { reference: params.completionDebitReference },
    select: { id: true },
  })
  const existingLedgerTx = await prisma.transaction.findFirst({
    where: { reference: params.completionDebitReference },
    select: { id: true },
  })
  if (existingWalletTx || existingLedgerTx) return

  const fareToCharge = round2(Number(params.fareToCharge) || 0)
  let platformFee = 0
  try {
    platformFee = await checkoutPlatformFeeAmount("RIDING", fareToCharge)
  } catch (e) {
    console.error("[deferred-ride-wallet-settlement] checkoutPlatformFeeAmount failed:", e)
    platformFee = 0
  }
  const platformFeeNum = round2(Number(platformFee) || 0)
  const totalCharge = Math.max(0, round2(fareToCharge + platformFeeNum))

  if (!Number.isFinite(totalCharge) || totalCharge <= 0) return

  const defaultCurrency =
    (await prisma.currency.findFirst({
      where: { isDefault: true },
      select: { code: true },
    }))?.code || "NGN"

  await prisma.$transaction(async (tx) => {
    const dup = await tx.walletTransaction.findFirst({
      where: { reference: params.completionDebitReference },
      select: { id: true },
    })
    if (dup) return

    let wallet = await tx.wallet.findUnique({
      where: { userId: params.customerId },
    })
    if (!wallet) {
      wallet = await tx.wallet.create({
        data: {
          userId: params.customerId,
          balance: 0,
          currency: defaultCurrency,
        },
      })
    }

    const prev = Number(wallet.balance || 0)
    const nextBal = round2(prev - totalCharge)

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: nextBal },
    })

    const walletTx = await tx.walletTransaction.create({
      data: {
        userId: params.customerId,
        type: "DEBIT",
        amount: totalCharge,
        balance: nextBal,
        description: params.description,
        reference: params.completionDebitReference,
        orderId: params.linkedRecordId ?? undefined,
        status: "COMPLETED",
        metadata: {
          ...params.metadata,
          fareAmount: fareToCharge,
          platformFee: platformFeeNum,
          totalCharge,
        },
      },
    })

    /** Ledger `transactions` row (FK `orderId` → Order only; ride/courier ids stay in metadata). */
    await tx.transaction.create({
      data: {
        userId: params.customerId,
        walletId: wallet.id,
        type: "WALLET_DEDUCTION",
        amount: -totalCharge,
        currency: wallet.currency,
        status: "COMPLETED",
        description: params.description,
        reference: params.completionDebitReference,
        metadata: {
          ...params.metadata,
          walletTransactionId: walletTx.id,
          fareAmount: fareToCharge,
          platformFee: platformFeeNum,
          totalCharge,
          linkedRecordId: params.linkedRecordId ?? undefined,
        },
      },
    })
  })
}
