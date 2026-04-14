import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { parseAdminRange, previousWindow } from "@/lib/adminDateRange"

function buildTimeBuckets(start: Date, end: Date, maxBars: number) {
  const ms = end.getTime() - start.getTime()
  const n = Math.min(Math.max(maxBars, 1), 24)
  const step = ms / n
  const buckets: { label: string; start: Date; end: Date }[] = []
  for (let i = 0; i < n; i++) {
    const s = new Date(start.getTime() + i * step)
    const e = new Date(start.getTime() + (i + 1) * step)
    const label =
      ms <= 36 * 60 * 60 * 1000
        ? `${s.getMonth() + 1}/${s.getDate()} ${s.getHours()}:00`
        : `${s.getMonth() + 1}/${s.getDate()}`
    buckets.push({ label, start: s, end: e })
  }
  return buckets
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range") || "7d"
    const { start: startDate, end: endDate } = parseAdminRange(range)
    const prev = previousWindow(startDate, endDate)

    const defaultCurrency = await prisma.currency.findFirst({
      where: { isDefault: true },
      select: { symbol: true, code: true },
    })
    const currencySymbol = defaultCurrency?.symbol || "₦"

    const dateWhere = { gte: startDate, lte: endDate }

    const [
      totalVolumeResult,
      totalTransactions,
      successfulTransactions,
      pendingPayments,
      failedPayments,
      cancelledCount,
      refundAgg,
      pendingWithdrawals,
      totalCommission,
      gatewayPaidAgg,
      gatewayPaidCount,
      gatewayPendingCount,
      gatewayFailedCount,
      prevVolume,
      typeGroups,
      statusGroups,
    ] = await Promise.all([
      prisma.walletTransaction.aggregate({
        where: { status: "COMPLETED", createdAt: dateWhere },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.count({ where: { createdAt: dateWhere } }),
      prisma.walletTransaction.count({ where: { status: "COMPLETED", createdAt: dateWhere } }),
      prisma.walletTransaction.count({ where: { status: "PENDING", createdAt: dateWhere } }),
      prisma.walletTransaction.count({ where: { status: "FAILED", createdAt: dateWhere } }),
      prisma.walletTransaction.count({ where: { status: "CANCELLED", createdAt: dateWhere } }),
      prisma.walletTransaction.aggregate({
        where: { type: "REFUND", createdAt: dateWhere },
        _sum: { amount: true },
      }),
      prisma.vendorWithdrawal.count({ where: { status: "PENDING" } }),
      prisma.vendorCommission.aggregate({
        where: { status: "PAID", createdAt: dateWhere },
        _sum: { commissionAmount: true },
      }),
      prisma.payment.aggregate({
        where: { status: "PAID", createdAt: dateWhere },
        _sum: { amount: true },
      }),
      prisma.payment.count({ where: { status: "PAID", createdAt: dateWhere } }),
      prisma.payment.count({ where: { status: "PENDING", createdAt: dateWhere } }),
      prisma.payment.count({ where: { status: "FAILED", createdAt: dateWhere } }),
      prisma.walletTransaction.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: prev.start, lte: prev.end } },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.groupBy({
        by: ["type"],
        where: { createdAt: dateWhere },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.groupBy({
        by: ["status"],
        where: { createdAt: dateWhere },
        _count: { id: true },
      }),
    ])

    const currentVol = totalVolumeResult._sum.amount || 0
    const prevVol = prevVolume._sum.amount || 0
    const volumeChangePercent =
      prevVol > 0 ? Math.round(((currentVol - prevVol) / prevVol) * 1000) / 10 : currentVol > 0 ? 100 : 0

    const successRate = totalTransactions > 0 ? Math.round((successfulTransactions / totalTransactions) * 10000) / 100 : 0

    const buckets = buildTimeBuckets(startDate, endDate, range === "24h" ? 8 : range === "7d" ? 7 : 12)
    const timeSeries = await Promise.all(
      buckets.map(async (b) => {
        const w = await prisma.walletTransaction.aggregate({
          where: { status: "COMPLETED", createdAt: { gte: b.start, lte: b.end } },
          _sum: { amount: true },
        })
        const g = await prisma.payment.aggregate({
          where: { status: "PAID", createdAt: { gte: b.start, lte: b.end } },
          _sum: { amount: true },
        })
        return {
          label: b.label,
          walletVolume: w._sum.amount || 0,
          gatewayVolume: g._sum.amount || 0,
        }
      }),
    )

    const stats = {
      currencySymbol,
      totalVolume: currentVol,
      totalTransactions,
      successRate,
      pendingPayments,
      failedPayments,
      cancelledWalletTx: cancelledCount,
      totalRefunds: refundAgg._sum.amount || 0,
      pendingWithdrawals,
      totalCommission: totalCommission._sum.commissionAmount || 0,
      gatewayPaidVolume: gatewayPaidAgg._sum.amount || 0,
      gatewayPaidCount,
      gatewayPendingCount,
      gatewayFailedCount,
      volumeChangePercent,
      walletByType: typeGroups.map((t) => ({
        type: t.type,
        count: t._count.id,
        volume: t._sum.amount || 0,
      })),
      walletByStatus: statusGroups.map((s) => ({
        status: s.status,
        count: s._count.id,
      })),
      timeSeries,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("Error fetching payment stats:", error)
    return NextResponse.json({ error: "Failed to fetch payment stats" }, { status: 500 })
  }
}
