import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getVendorWithdrawableBalance } from "@/lib/vendor-withdrawable-balance"

/**
 * Unified wallet summary for vendor role (pharmacy, food, grocery, auto-parts, etc.).
 * `available` = cleared funds eligible for withdrawal (business-day rule).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: session.id },
    })

    const { withdrawable, clearedCredits, reservedOrPaidWithdrawals, clearingBusinessDays } =
      await getVendorWithdrawableBalance(session.id)

    const total = wallet?.balance ?? 0
    const pending = Math.max(0, total - withdrawable)

    return NextResponse.json({
      total,
      available: withdrawable,
      pending,
      frozen: 0,
      clearingBusinessDays,
      clearedCredits,
      reservedOrPaidWithdrawals,
      hint:
        "Available = order payouts past the clearing window, minus completed or pending withdrawal requests.",
    })
  } catch (e) {
    console.error("vendor wallet balance:", e)
    return NextResponse.json({ error: "Failed to load wallet" }, { status: 500 })
  }
}
