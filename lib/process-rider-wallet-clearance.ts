import { prisma } from "@/lib/prisma"
import { completeWalletTransaction } from "@/lib/wallet-transaction-service"
import { NotificationBridge } from "@/lib/notification-bridge"

const RIDER_CLEARANCE_META_TYPES = new Set(["EARNING_PAYOUT", "DELIVERY_PAYMENT"])

function txMetaType(metadata: unknown): string | undefined {
  if (metadata && typeof metadata === "object" && "transactionType" in metadata) {
    return String((metadata as { transactionType?: string }).transactionType || "")
  }
  return undefined
}

/**
 * Rider net payouts and deferred delivery credits use `clearsAt` for the clearance worker.
 * Rows missing `clearsAt` never clear — backfill from row `createdAt`.
 */
export async function backfillMissingRiderClearsAt(): Promise<{ updated: number }> {
  const { getRiderWalletClearanceDays, computeWalletClearsAt } = await import(
    "@/lib/rider-wallet-clearance-settings"
  )
  const days = await getRiderWalletClearanceDays()
  const rows = await prisma.walletTransaction.findMany({
    where: {
      status: "PENDING",
      type: "CREDIT",
      clearsAt: null,
      OR: [
        { reference: { startsWith: "earning-payout:ride:" } },
        { reference: { startsWith: "earning-payout:courier:" } },
        { reference: { contains: ":delivery" } },
      ],
    },
    take: 300,
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, reference: true, metadata: true },
  })
  let updated = 0
  for (const r of rows) {
    const ref = String(r.reference || "")
    const metaType = txMetaType(r.metadata)
    const isKnownRef =
      ref.startsWith("earning-payout:ride:") ||
      ref.startsWith("earning-payout:courier:") ||
      ref.includes(":delivery")
    const isRiderClearanceMeta =
      metaType != null && RIDER_CLEARANCE_META_TYPES.has(metaType)
    if (!isKnownRef && !isRiderClearanceMeta) continue

    const clearsAt = computeWalletClearsAt(days, r.createdAt)
    await prisma.walletTransaction.update({
      where: { id: r.id },
      data: { clearsAt },
    })
    updated++
  }

  /** Catch-all: rider PENDING credits with clearance metadata but no reference pattern. */
  const metaRows = await prisma.walletTransaction.findMany({
    where: {
      status: "PENDING",
      type: "CREDIT",
      clearsAt: null,
      reference: null,
    },
    take: 100,
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, metadata: true },
  })
  for (const r of metaRows) {
    const metaType = txMetaType(r.metadata)
    if (!metaType || !RIDER_CLEARANCE_META_TYPES.has(metaType)) continue
    const clearsAt = computeWalletClearsAt(days, r.createdAt)
    await prisma.walletTransaction.update({
      where: { id: r.id },
      data: { clearsAt },
    })
    updated++
  }

  return { updated }
}

/** @deprecated Use backfillMissingRiderClearsAt */
export const backfillMissingEarningPayoutClearsAt = backfillMissingRiderClearsAt

/**
 * Move held rider CREDIT rows to COMPLETED when clearsAt has passed.
 * Idempotent per transaction via completeWalletTransaction.
 */
export async function processRiderWalletClearance(): Promise<{ cleared: number }> {
  await backfillMissingRiderClearsAt().catch((e) =>
    console.error("[processRiderWalletClearance] backfill clearsAt", e)
  )

  const now = new Date()
  const batch = await prisma.walletTransaction.findMany({
    where: {
      status: "PENDING",
      type: "CREDIT",
      clearsAt: { not: null, lte: now },
    },
    take: 300,
    orderBy: { clearsAt: "asc" },
  })

  let cleared = 0
  for (const tx of batch) {
    try {
      await completeWalletTransaction(tx.id)
      cleared++

      const user = await prisma.user.findUnique({
        where: { id: tx.userId },
        select: { role: true },
      })
      if (user?.role === "RIDER") {
        await NotificationBridge.sendNotification({
          userId: tx.userId,
          title: "Wallet balance cleared",
          message: `${tx.amount.toFixed(2)} from a completed trip is now available in your wallet.`,
          type: "WALLET_UPDATE",
          module: "COURIER",
          data: { actionType: "navigate", screen: "Wallet" },
        })
      }
    } catch (e) {
      console.error("[processRiderWalletClearance] tx", tx.id, e)
    }
  }

  return { cleared }
}
