import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MoneyAdminAuthError, requireMoneyTransferAdmin } from "@/lib/money-transfer-admin"

export async function GET(request: NextRequest) {
  try {
    await requireMoneyTransferAdmin(request)

    const [
      totalGroups,
      activeGroups,
      completedGroups,
      disputedGroups,
      totalContributions,
      failedContributions,
      totalTreasury,
    ] = await Promise.all([
      prisma.ajoGroup.count(),
      prisma.ajoGroup.count({
        where: { status: { in: ["ACTIVE", "CYCLE_IN_PROGRESS", "CYCLE_PAYOUT_PENDING"] } },
      }),
      prisma.ajoGroup.count({ where: { status: "COMPLETED" } }),
      prisma.ajoGroup.count({ where: { status: "DISPUTED" } }),
      prisma.ajoContribution.count({ where: { status: "PAID" } }),
      prisma.ajoContribution.count({ where: { status: { in: ["FAILED", "LATE"] } } }),
      prisma.ajoGroup.aggregate({ _sum: { treasuryBalance: true } }),
    ])

    return NextResponse.json({
      success: true,
      stats: {
        totalGroups,
        activeGroups,
        completedGroups,
        disputedGroups,
        totalContributions,
        failedContributions,
        totalTreasury: totalTreasury._sum.treasuryBalance ?? 0,
      },
    })
  } catch (error: unknown) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("admin ajo/stats GET:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
