import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MoneyAdminAuthError, requireMoneyTransferAdmin } from "@/lib/money-transfer-admin"
import { authenticateRequest } from "@/lib/auth"

/** Transfers that have cleared payment and count toward volume / earnings (excludes unpaid / failed). */
const REPORTING_STATUSES = ["PROCESSING", "SENT", "COMPLETED"] as const

export async function GET() {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const settings = await prisma.systemSettings.findFirst({ select: { currency: true } })
    const reportingCurrency = (settings?.currency || "USD").trim().toUpperCase()

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const volumeWhere = { status: { in: [...REPORTING_STATUSES] } }

    const [
      sums,
      statusGroups,
      todayCount,
      todaySums,
      totalCount,
      openCases,
      openRefundCases,
    ] = await Promise.all([
      prisma.moneyTransfer.aggregate({
        where: volumeWhere,
        _sum: {
          baseAmount: true,
          feeBase: true,
          fxMarginBase: true,
        },
      }),
      prisma.moneyTransfer.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.moneyTransfer.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      prisma.moneyTransfer.aggregate({
        where: { ...volumeWhere, createdAt: { gte: startOfToday } },
        _sum: {
          baseAmount: true,
          feeBase: true,
          fxMarginBase: true,
        },
      }),
      prisma.moneyTransfer.count(),
      prisma.moneyTransferCase.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      prisma.moneyTransferCase.count({
        where: {
          type: "REFUND_REQUEST",
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
    ])

    const totalVolumeBase = sums._sum.baseAmount ?? 0
    const totalFeeBase = sums._sum.feeBase ?? 0
    const totalFxMarginBase = sums._sum.fxMarginBase ?? 0
    const totalPlatformRevenueBase = totalFeeBase + totalFxMarginBase

    const todayVolumeBase = todaySums._sum.baseAmount ?? 0
    const todayFeeBase = todaySums._sum.feeBase ?? 0
    const todayFxMarginBase = todaySums._sum.fxMarginBase ?? 0
    const todayPlatformRevenueBase = todayFeeBase + todayFxMarginBase

    const byStatus: Record<string, number> = {}
    for (const row of statusGroups) {
      byStatus[row.status] = row._count._all
    }

    return NextResponse.json({
      success: true,
      reportingCurrency,
      totalTransfers: totalCount,
      totalVolumeBase,
      totalFeeBase,
      totalFxMarginBase,
      totalPlatformRevenueBase,
      taxableEarningsBase: totalPlatformRevenueBase,
      pendingTransfers: byStatus.PENDING ?? 0,
      processingTransfers: byStatus.PROCESSING ?? 0,
      completedTransfers: byStatus.COMPLETED ?? 0,
      sentTransfers: byStatus.SENT ?? 0,
      settledTransfers: (byStatus.COMPLETED ?? 0) + (byStatus.SENT ?? 0),
      failedTransfers: byStatus.FAILED ?? 0,
      cancelledTransfers: byStatus.CANCELLED ?? 0,
      todayTransfers: todayCount,
      todayVolumeBase,
      todayPlatformRevenueBase,
      openCases,
      openRefundCases,
    })
  } catch (error: unknown) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("money-app-admin stats:", error)
    const message = error instanceof Error ? error.message : "Failed to load stats"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
