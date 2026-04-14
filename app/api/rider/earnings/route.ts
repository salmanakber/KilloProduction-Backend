import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '30d' // 7d, 30d, 90d, 1y

    // Calculate date ranges
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const startOfQuarter = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
    const startOfYear = new Date(today.getFullYear(), 0, 1)

    let periodStart: Date
    switch (period) {
      case '7d':
        periodStart = startOfWeek
        break
      case '30d':
        periodStart = startOfMonth
        break
      case '90d':
        periodStart = startOfQuarter
        break
      case '1y':
        periodStart = startOfYear
        break
      default:
        periodStart = startOfMonth
    }

    // Fetch all earnings for the rider
    const allEarnings = await prisma.riderEarning.findMany({
      where: {
        riderId: session.id,
      },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Calculate period-specific earnings
    const periodEarnings = allEarnings.filter(
      (earning) => new Date(earning.createdAt) >= periodStart
    )

    // Calculate totals
    const totalEarnings = allEarnings.reduce((sum, e) => sum + e.netAmount, 0)
    const periodTotal = periodEarnings.reduce((sum, e) => sum + e.netAmount, 0)
    const todayEarnings = allEarnings
      .filter((e) => new Date(e.createdAt) >= startOfDay)
      .reduce((sum, e) => sum + e.netAmount, 0)
    const weekEarnings = allEarnings
      .filter((e) => new Date(e.createdAt) >= startOfWeek)
      .reduce((sum, e) => sum + e.netAmount, 0)
    const monthEarnings = allEarnings
      .filter((e) => new Date(e.createdAt) >= startOfMonth)
      .reduce((sum, e) => sum + e.netAmount, 0)

    // Calculate by status
    const pendingEarnings = allEarnings
      .filter((e) => e.status === 'PENDING')
      .reduce((sum, e) => sum + e.netAmount, 0)
    const paidEarnings = allEarnings
      .filter((e) => e.status === 'PAID')
      .reduce((sum, e) => sum + e.netAmount, 0)

    // Calculate by type
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

    // Calculate total commission paid
    const totalCommission = allEarnings.reduce((sum, e) => sum + e.commission, 0)
    const totalAmount = allEarnings.reduce((sum, e) => sum + e.amount, 0)

    // Calculate average commission rate
    const averageCommissionRate =
      totalAmount > 0 ? (totalCommission / totalAmount) * 100 : 0

    // Get last month for comparison
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    const lastMonthEarnings = allEarnings
      .filter(
        (e) =>
          new Date(e.createdAt) >= lastMonthStart &&
          new Date(e.createdAt) <= lastMonthEnd
      )
      .reduce((sum, e) => sum + e.netAmount, 0)

    // Calculate growth percentage
    const growthPercentage =
      lastMonthEarnings > 0
        ? ((monthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100
        : 0

    // Generate daily earnings data for the selected period (for charts)
    const dailyEarnings: { [key: string]: number } = {}
    periodEarnings.forEach((earning) => {
      const dateKey = new Date(earning.createdAt).toISOString().split('T')[0]
      dailyEarnings[dateKey] = (dailyEarnings[dateKey] || 0) + earning.netAmount
    })

    // Sort dates and get labels/data for chart
    const sortedDates = Object.keys(dailyEarnings).sort()
    const chartLabels = sortedDates.map((date) => {
      const d = new Date(date)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    })
    const chartData = sortedDates.map((date) => dailyEarnings[date])

    // Get recent earnings (last 10)
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

    // Calculate statistics
    const totalTrips = allEarnings.filter((e) => e.type === 'DELIVERY_FEE').length
    const periodTrips = periodEarnings.filter((e) => e.type === 'DELIVERY_FEE').length
    const averageEarningPerTrip =
      totalTrips > 0 ? totalEarnings / totalTrips : 0

    return NextResponse.json({
      success: true,
      data: {
        totalEarnings,
        periodTotal,
        todayEarnings,
        weekEarnings,
        monthEarnings,
        lastMonthEarnings,
        growthPercentage,
        pendingEarnings,
        paidEarnings,
        earningsByType,
        totalCommission,
        totalAmount,
        averageCommissionRate,
        totalTrips,
        periodTrips,
        averageEarningPerTrip,
        chartData: {
          labels: chartLabels,
          datasets: [{ data: chartData }],
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




