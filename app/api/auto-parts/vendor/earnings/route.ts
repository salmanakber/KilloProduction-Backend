import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getVendorMerchandiseCredits, sumCreditsInRange } from "@/lib/vendor-wallet-revenue"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period") || "30d"

    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - 7)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)

    let periodStart: Date
    switch (period) {
      case "7d":
        periodStart = startOfWeek
        break
      case "30d":
        periodStart = startOfMonth
        break
      case "90d":
        periodStart = new Date(today)
        periodStart.setDate(today.getDate() - 90)
        break
      case "1y":
        periodStart = new Date(today.getFullYear(), 0, 1)
        break
      default:
        periodStart = startOfMonth
    }

    const { txs } = await getVendorMerchandiseCredits({
      vendorUserId: user.id,
      module: "AUTO_PARTS",
    })

    const totalEarnings = txs.reduce((s, t) => s + Number(t.amount || 0), 0)
    const periodEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const periodTotal = sumCreditsInRange(txs, periodStart, periodEnd)

    const todayEarnings = sumCreditsInRange(txs, startOfDay, periodEnd)
    const weekEarnings = sumCreditsInRange(txs, startOfWeek, periodEnd)
    const monthEarnings = sumCreditsInRange(txs, startOfMonth, periodEnd)
    const lastMonthEarnings = sumCreditsInRange(txs, startOfLastMonth, new Date(endOfLastMonth.getTime() + 86400000))

    const pendingWithdrawals = await prisma.vendorWithdrawal.aggregate({
      where: {
        vendorId: user.id,
        status: { in: ["PENDING", "APPROVED"] },
      },
      _sum: { amount: true },
    })

    const pendingPayouts = pendingWithdrawals._sum.amount || 0

    const settledWhere = {
      vendorId: user.id,
      module: "AUTO_PARTS" as const,
      status: { in: ["DELIVERED", "COMPLETED"] as any },
    }

    const totalOrders = await prisma.order.count({ where: settledWhere })
    const periodOrdersCount = await prisma.order.count({
      where: {
        ...settledWhere,
        createdAt: { gte: periodStart, lte: today },
      },
    })

    const averageOrderValue = totalOrders > 0 ? totalEarnings / totalOrders : 0

    const systemSettings = await prisma.systemSettings.findFirst()
    const commissionRate = systemSettings?.autoPartsCommission || 15
    const totalCommission = totalEarnings * (commissionRate / 100)

    const growthPercentage =
      lastMonthEarnings > 0 ? ((monthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100 : 0

    const chartLabels: string[] = []
    const chartDataPoints: number[] = []
    let currentDate = new Date(periodStart)
    while (currentDate <= today) {
      const dayStart = new Date(currentDate)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      chartLabels.push(currentDate.toLocaleDateString("en-US", { day: "numeric", month: "short" }))
      chartDataPoints.push(sumCreditsInRange(txs, dayStart, dayEnd))
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return NextResponse.json({
      totalEarnings,
      thisMonth: monthEarnings,
      lastMonth: lastMonthEarnings,
      thisWeek: weekEarnings,
      today: todayEarnings,
      pendingPayouts,
      totalOrders,
      periodOrders: periodOrdersCount,
      averageOrderValue,
      commissionRate,
      platformFees: totalCommission,
      periodTotal,
      growthPercentage,
      chartData: {
        labels: chartLabels,
        datasets: [{ data: chartDataPoints }],
      },
      revenueSource: "wallet_delivered",
    })
  } catch (error) {
    console.error("Error fetching vendor earnings:", error)
    return NextResponse.json({ error: "Failed to fetch vendor earnings" }, { status: 500 })
  }
}
