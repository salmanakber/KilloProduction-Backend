import { prisma } from "@/lib/prisma"
import { creditWithdrawableAfterUTC } from "@/lib/business-days"

const DEFAULT_CLEARING_BUSINESS_DAYS = 3

function metaType(metadata: unknown): string | undefined {
  if (metadata && typeof metadata === "object" && "transactionType" in metadata) {
    return String((metadata as { transactionType?: string }).transactionType || "")
  }
  return undefined
}

/** Vendor order payout credits (excludes rider delivery credits on another user; here userId is vendor). */
function isVendorOrderCredit(metadata: unknown, orderId: string | null): boolean {
  const t = metaType(metadata)
  if (t === "DELIVERY_PAYMENT") return false
  if (t === "ORDER_PAYMENT") return true
  if (orderId && !t) return true
  return false
}

export interface VendorWithdrawableResult {
  /** Amount that may be requested for withdrawal right now */
  withdrawable: number
  /** Sum of COMPLETED vendor order credits past clearing window */
  clearedCredits: number
  /** Sum of vendor withdrawal rows that reserve or have paid out funds */
  reservedOrPaidWithdrawals: number
  clearingBusinessDays: number
}

/**
 * Withdrawable balance from settled wallet credits (business-day clearing), minus debits and pending withdrawal requests.
 */
export async function getVendorWithdrawableBalance(
  vendorUserId: string,
  options?: { clearingBusinessDays?: number }
): Promise<VendorWithdrawableResult> {
  const clearingBusinessDays = options?.clearingBusinessDays ?? DEFAULT_CLEARING_BUSINESS_DAYS
  const now = new Date()

  const [credits, outboundAgg] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: {
        userId: vendorUserId,
        type: "CREDIT",
        status: "COMPLETED",
      },
      select: { amount: true, createdAt: true, metadata: true, orderId: true },
    }),
    prisma.vendorWithdrawal.aggregate({
      where: {
        vendorId: vendorUserId,
        status: { in: ["PENDING", "APPROVED", "PROCESSING", "COMPLETED"] },
      },
      _sum: { amount: true },
    }),
  ])

  let clearedCredits = 0
  for (const tx of credits) {
    if (!isVendorOrderCredit(tx.metadata, tx.orderId)) continue
    const eligibleAfter = creditWithdrawableAfterUTC(tx.createdAt, clearingBusinessDays)
    if (eligibleAfter <= now) clearedCredits += tx.amount
  }

  const reservedOrPaidWithdrawals = outboundAgg._sum.amount || 0
  const withdrawable = Math.max(0, clearedCredits - reservedOrPaidWithdrawals)

  return {
    withdrawable,
    clearedCredits,
    reservedOrPaidWithdrawals,
    clearingBusinessDays,
  }
}

/** Earliest calendar date (UTC midnight of that local business resolution) when a new request may complete payout — informational. */
export function scheduledPayoutDateUTC(clearingBusinessDays: number = DEFAULT_CLEARING_BUSINESS_DAYS): Date {
  return creditWithdrawableAfterUTC(new Date(), clearingBusinessDays)
}
