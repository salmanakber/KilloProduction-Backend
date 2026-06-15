import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"

const REPORTING_STATUSES = ["PROCESSING", "SENT", "COMPLETED"] as const

export async function GET(request: NextRequest) {
  try {
    await requireMoneyTransferAdmin(request)

    const { searchParams } = new URL(request.url)
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30", 10)))
    const since = new Date()
    since.setDate(since.getDate() - days)

    const settings = await prisma.systemSettings.findFirst({ select: { currency: true } })
    const reportingCurrency = (settings?.currency || "USD").trim().toUpperCase()

    const [
      volume,
      byStatus,
      bySendCurrency,
      byReceiveCurrency,
      bySettlement,
      failedCount,
      refundCount,
      casesOpen,
      payoutStats,
      walletCredits,
      walletDebits,
      topUpCredits,
      byPaymentSource,
    ] = await Promise.all([
      prisma.moneyTransfer.aggregate({
        where: {
          status: { in: [...REPORTING_STATUSES] },
          createdAt: { gte: since },
        },
        _sum: { baseAmount: true, feeBase: true, fxMarginBase: true, amount: true },
        _count: { _all: true },
      }),
      prisma.moneyTransfer.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.moneyTransfer.groupBy({
        by: ["currency"],
        where: {
          status: { in: [...REPORTING_STATUSES] },
          createdAt: { gte: since },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.moneyTransfer.groupBy({
        by: ["receiveCurrency"],
        where: {
          status: { in: [...REPORTING_STATUSES] },
          createdAt: { gte: since },
          receiveCurrency: { not: null },
        },
        _sum: { receiveAmount: true },
        _count: { _all: true },
      }),
      prisma.moneyTransfer.groupBy({
        by: ["settlementMode"],
        where: {
          status: { in: [...REPORTING_STATUSES] },
          createdAt: { gte: since },
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.moneyTransfer.count({
        where: { status: "FAILED", createdAt: { gte: since } },
      }),
      prisma.moneyTransfer.count({
        where: { status: "REFUNDED", createdAt: { gte: since } },
      }),
      prisma.moneyTransferCase.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      prisma.moneyTransferPayout.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.moneyTransferWalletTransaction.groupBy({
        by: ["currency"],
        where: {
          type: "CREDIT",
          createdAt: { gte: since },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.moneyTransferWalletTransaction.groupBy({
        by: ["currency"],
        where: {
          type: { in: ["DEBIT", "WITHDRAWAL"] },
          createdAt: { gte: since },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.moneyTransferWalletTransaction.aggregate({
        where: {
          type: "CREDIT",
          createdAt: { gte: since },
          metadata: { path: ["topup"], equals: true },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.moneyTransfer.groupBy({
        by: ["settlementMode"],
        where: {
          status: { in: [...REPORTING_STATUSES] },
          createdAt: { gte: since },
          metadata: { path: ["paymentSource"], equals: "WALLET" },
        },
        _count: { _all: true },
      }),
    ])

    const feeBase = volume._sum.feeBase ?? 0
    const fxMarginBase = volume._sum.fxMarginBase ?? 0

    const payoutVolumeNgn =
      payoutStats.reduce((sum, p) => sum + (p._sum.amount ?? 0), 0) / 100

    return NextResponse.json({
      success: true,
      periodDays: days,
      since: since.toISOString(),
      reportingCurrency,
      summary: {
        transferCount: volume._count._all,
        volumeBase: volume._sum.baseAmount ?? 0,
        platformRevenueBase: feeBase + fxMarginBase,
        feeBase,
        fxMarginBase,
        failedCount,
        refundCount,
        openCases: casesOpen,
        payoutCount: payoutStats.reduce((s, p) => s + p._count._all, 0),
        payoutVolumeNgn,
        walletTopUpCount: topUpCredits._count._all,
        walletTopUpVolume: topUpCredits._sum.amount ?? 0,
      },
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
      bySendCurrency: bySendCurrency.map((r) => ({
        currency: r.currency,
        count: r._count._all,
        volume: r._sum.amount ?? 0,
      })),
      byReceiveCurrency: byReceiveCurrency.map((r) => ({
        currency: r.receiveCurrency || "—",
        count: r._count._all,
        volume: r._sum.receiveAmount ?? 0,
      })),
      bySettlementMode: bySettlement.map((r) => ({
        mode: r.settlementMode,
        count: r._count._all,
        volume: r._sum.amount ?? 0,
      })),
      payouts: payoutStats.map((r) => ({
        status: r.status,
        count: r._count._all,
        volumeNgn: (r._sum.amount ?? 0) / 100,
      })),
      walletCredits: walletCredits.map((r) => ({
        currency: r.currency,
        count: r._count._all,
        volume: r._sum.amount ?? 0,
      })),
      walletDebits: walletDebits.map((r) => ({
        currency: r.currency,
        count: r._count._all,
        volume: r._sum.amount ?? 0,
      })),
      walletFundedTransfers: byPaymentSource.reduce((s, r) => s + r._count._all, 0),
    })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("money reports:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build report" },
      { status: 500 },
    )
  }
}
