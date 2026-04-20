import { prisma } from "@/lib/prisma"
import { completeWalletTransaction } from "@/lib/wallet-transaction-service"
import { NotificationBridge } from "@/lib/notification-bridge"

/**
 * Move held rider CREDIT rows to COMPLETED when clearsAt has passed.
 * Idempotent per transaction via completeWalletTransaction.
 */
export async function processRiderWalletClearance(): Promise<{ cleared: number }> {
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
