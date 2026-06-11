import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import { getRiderWalletClearanceDays } from "@/lib/rider-wallet-clearance-settings"
import { getRiderWithdrawableBalance } from "@/lib/rider-available-balance"
import { buildRiderEarningsByChannel } from "@/lib/rider-earnings-reporting"
import { roundMoney2 } from "@/lib/money-round"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

    const clearanceDays = await getRiderWalletClearanceDays()

    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const heldAgg = await prisma.walletTransaction.aggregate({
      where: {
        userId: session.id,
        status: "PENDING",
        type: "CREDIT",
        clearsAt: { not: null },
      },
      _sum: { amount: true },
    })
    const pendingClearanceRaw = heldAgg._sum?.amount ?? 0

    const walletRow = await prisma.wallet.findUnique({
      where: { userId: session.id },
      select: { balance: true },
    })
    const clearedInWallet = roundMoney2(walletRow?.balance ?? 0)

    // Get all rider earnings
    const allEarnings = await prisma.riderEarning.findMany({
      where: {
        riderId: session.id,
      },
    })

    const paidEarnings = roundMoney2(
      allEarnings
        .filter((e) => e.status === "PAID")
        .reduce((sum, e) => sum + e.netAmount, 0),
    )
    const pendingEarnings = roundMoney2(
      allEarnings
        .filter((e) => e.status === "PENDING")
        .reduce((sum, e) => sum + e.netAmount, 0),
    )

    const totalWithdrawn = await prisma.vendorWithdrawal.aggregate({
      where: {
        vendorId: session.id,
        status: "COMPLETED",
      },
      _sum: { amount: true },
    })

    const availableRaw = await getRiderWithdrawableBalance(session.id)
    const available = roundMoney2(availableRaw)
    const pendingClearance = roundMoney2(pendingClearanceRaw)
    const earningsByChannel = await buildRiderEarningsByChannel(session.id)
    const todayEarningsByChannel = await buildRiderEarningsByChannel(session.id, startOfDay)

    return NextResponse.json({
      /**
       * Completed-trip reporting total (online + cash). Not the same as withdrawable wallet.
       */
      lifetimeNetEarnings: earningsByChannel.totalReportingNet,
      /** Completed-trip reporting split (cash is not withdrawable). */
      earningsByChannel,
      todayEarningsByChannel,
      todayOnlineNet: todayEarningsByChannel.periodOnlineNet,
      onlineNet: earningsByChannel.onlineNet,
      cashCollectedNet: earningsByChannel.cashCollectedNet,
      platformCommissionOwed: earningsByChannel.platformCommissionOwed,
      totalReportingNet: earningsByChannel.totalReportingNet,
      /** Amount already credited to the wallet (cleared COMPLETED credits). Same as ledger wallet row. */
      clearedInWallet,
      /**
       * Withdrawable cash: cleared wallet balance minus completed + pending withdrawal requests.
       * Wallet transaction amounts are already net of platform fee.
       */
      available,
      /** `total` = clearedInWallet — use for "balance in wallet" UIs (not lifetime earnings). */
      total: clearedInWallet,
      /** CREDIT rows still in clearance window (not yet in wallet.balance). */
      pending: pendingClearance,
      pendingClearance,
      clearanceDays,
      frozen: 0,
      totalWithdrawn: roundMoney2(totalWithdrawn._sum.amount || 0),
      paidEarnings,
      pendingEarningsFromTrips: pendingEarnings,
    })
  } catch (error) {
    console.error("Error fetching rider wallet balance:", error)
    return NextResponse.json(
      { error: "Failed to fetch wallet balance" },
      { status: 500 }
    )
  }
}
