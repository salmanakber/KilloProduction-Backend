import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import { roundMoney2 } from "@/lib/money-round"
import {
  buildRiderDailyChannelChart,
  buildRiderEarningsByChannel,
  buildRiderTripCounts,
} from "@/lib/rider-earnings-reporting"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '7d'

    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - 6)
    startOfWeek.setHours(0, 0, 0, 0)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const startOfQuarter = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
    const startOfYear = new Date(today.getFullYear(), 0, 1)
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)
    const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1)
    const endOfLastYear = new Date(today.getFullYear() - 1, 11, 31, 23, 59, 59, 999)

    let periodStart: Date
    let periodEnd = new Date(today)
    periodEnd.setHours(23, 59, 59, 999)

    switch (period) {
      case '7d':
        periodStart = startOfWeek
        break
      case '30d':
        periodStart = startOfMonth
        break
      case 'last_month':
        periodStart = startOfLastMonth
        periodEnd = endOfLastMonth
        break
      case '90d':
        periodStart = startOfQuarter
        break
      case '1y':
        periodStart = startOfYear
        break
      case 'last_year':
        periodStart = startOfLastYear
        periodEnd = endOfLastYear
        break
      default:
        periodStart = startOfWeek
    }

    const [allEarnings, tripCounts, earningsByChannel] = await Promise.all([
      prisma.riderEarning.findMany({
        where: { riderId: session.id },
        include: {
          rider: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      buildRiderTripCounts(session.id, periodStart),
      buildRiderEarningsByChannel(session.id, periodStart),
    ])

    const periodEarnings = allEarnings.filter((earning) => {
      const created = new Date(earning.createdAt)
      return created >= periodStart && created <= periodEnd
    })

    const totalEarnings = earningsByChannel.totalReportingNet
    const periodTotal = earningsByChannel.periodReportingNet

    const rideLinked = allEarnings.filter((e) => e.rideBookingId != null && e.rideBookingId !== "")
    const orderOnlyLinked = allEarnings.filter(
      (e) => (e.rideBookingId == null || e.rideBookingId === "") && e.orderId != null && e.orderId !== "",
    )
    const unlinked = allEarnings.filter(
      (e) =>
        (e.rideBookingId == null || e.rideBookingId === "") &&
        (e.orderId == null || e.orderId === ""),
    )
    const lifetimeBreakdown = {
      netRideTrips: roundMoney2(rideLinked.reduce((s, e) => s + e.netAmount, 0)),
      netOrderDeliveries: roundMoney2(orderOnlyLinked.reduce((s, e) => s + e.netAmount, 0)),
      netOther: roundMoney2(unlinked.reduce((s, e) => s + e.netAmount, 0)),
      countRideLegs: tripCounts.completedRides,
      countOrderLegs: tripCounts.completedCourier,
      countUnlinkedLegs: unlinked.length,
    }

    const todayEarnings = allEarnings
      .filter((e) => new Date(e.createdAt) >= startOfDay)
      .reduce((sum, e) => sum + e.netAmount, 0)
    const weekEarnings = allEarnings
      .filter((e) => new Date(e.createdAt) >= startOfWeek)
      .reduce((sum, e) => sum + e.netAmount, 0)
    const monthEarnings = allEarnings
      .filter((e) => new Date(e.createdAt) >= startOfMonth)
      .reduce((sum, e) => sum + e.netAmount, 0)

    const pendingEarnings = roundMoney2(
      allEarnings.filter((e) => e.status === 'PENDING').reduce((sum, e) => sum + e.netAmount, 0),
    )
    const paidEarnings = roundMoney2(
      allEarnings.filter((e) => e.status === 'PAID').reduce((sum, e) => sum + e.netAmount, 0),
    )

    const earningsByType = {
      DELIVERY_FEE: allEarnings
        .filter((e) => e.type === 'DELIVERY_FEE')
        .reduce((sum, e) => sum + e.netAmount, 0),
      TIP: allEarnings
        .filter((e) => e.type === 'TIP')
        .reduce((sum, e) => sum + e.netAmount, 0),
      BONUS: allEarnings
        .filter((e) => e.type === 'BONUS')
        .reduce((sum, e) => sum + e.netAmount, 0),
      COMMISSION: allEarnings
        .filter((e) => e.type === 'COMMISSION')
        .reduce((sum, e) => sum + e.netAmount, 0),
      PENALTY: allEarnings
        .filter((e) => e.type === 'PENALTY')
        .reduce((sum, e) => sum + e.netAmount, 0),
    }

    const totalCommission = allEarnings.reduce((sum, e) => sum + e.commission, 0)
    const totalAmount = allEarnings.reduce((sum, e) => sum + e.amount, 0)
    const averageCommissionRate =
      totalAmount > 0 ? (totalCommission / totalAmount) * 100 : 0

    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    const lastMonthEarnings = allEarnings
      .filter(
        (e) =>
          new Date(e.createdAt) >= lastMonthStart &&
          new Date(e.createdAt) <= lastMonthEnd
      )
      .reduce((sum, e) => sum + e.netAmount, 0)

    const growthPercentage =
      lastMonthEarnings > 0
        ? ((monthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100
        : 0

    const periodEndChart = new Date(periodEnd)
    periodEndChart.setHours(23, 59, 59, 999)
    const { dailyOnline, dailyCash } = await buildRiderDailyChannelChart(
      session.id,
      periodStart,
      periodEndChart
    )

    const chartLabels: string[] = []
    const chartOnlinePoints: number[] = []
    const chartCashPoints: number[] = []
    const cursor = new Date(periodStart)
    while (cursor <= periodEndChart) {
      const dateKey = cursor.toISOString().split('T')[0]
      chartLabels.push(cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
      chartOnlinePoints.push(roundMoney2(dailyOnline[dateKey] || 0))
      chartCashPoints.push(roundMoney2(dailyCash[dateKey] || 0))
      cursor.setDate(cursor.getDate() + 1)
    }

    const recentEarnings = periodEarnings.slice(0, 10).map((earning) => ({
      id: earning.id,
      type: earning.type,
      amount: earning.amount,
      commission: earning.commission,
      netAmount: earning.netAmount,
      status: earning.status,
      description: earning.description,
      createdAt: earning.createdAt.toISOString(),
      paidAt: earning.paidAt?.toISOString() || null,
    }))

    const totalTrips = tripCounts.completed
    const periodTrips = tripCounts.periodCompleted
    const averageEarningPerTrip =
      totalTrips > 0 ? totalEarnings / totalTrips : 0

    return NextResponse.json({
      success: true,
      data: {
        totalEarnings,
        periodTotal,
        todayEarnings: roundMoney2(todayEarnings),
        weekEarnings: roundMoney2(weekEarnings),
        monthEarnings: roundMoney2(monthEarnings),
        lastMonthEarnings: roundMoney2(lastMonthEarnings),
        growthPercentage,
        pendingEarnings,
        paidEarnings,
        earningsByType,
        totalCommission: roundMoney2(totalCommission),
        totalAmount: roundMoney2(totalAmount),
        averageCommissionRate,
        totalTrips,
        periodTrips,
        averageEarningPerTrip: roundMoney2(averageEarningPerTrip),
        tripCounts,
        earningsByChannel,
        lifetimeBreakdown,
        chartData: {
          labels: chartLabels,
          datasets: [
            {
              data: chartOnlinePoints,
              color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
              strokeWidth: 2,
            },
            {
              data: chartCashPoints,
              color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`,
              strokeWidth: 2,
            },
          ],
          legend: ['Wallet earnings', 'Cash collected'],
        },
        recentEarnings,
        period,
      },
    })
  } catch (error) {
    console.error("Error fetching rider earnings:", error)
    return NextResponse.json(
      { error: "Failed to fetch earnings data" },
      { status: 500 }
    )
  }
}
