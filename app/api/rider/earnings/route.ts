import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { roundMoney2 } from "@/lib/money-round"

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

    // Calculate totals (lifetime net = sum of RiderEarning.netAmount)
    const totalEarnings = roundMoney2(allEarnings.reduce((sum, e) => sum + e.netAmount, 0))
    const periodTotal = roundMoney2(periodEarnings.reduce((sum, e) => sum + e.netAmount, 0))

    /** Split lifetime net by ride vs order-linked work (courier/delivery). */
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
      countRideLegs: rideLinked.length,
      countOrderLegs: orderOnlyLinked.length,
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

    // Calculate by status
    const pendingEarnings = roundMoney2(
      allEarnings.filter((e) => e.status === 'PENDING').reduce((sum, e) => sum + e.netAmount, 0),
    )
    const paidEarnings = roundMoney2(
      allEarnings.filter((e) => e.status === 'PAID').reduce((sum, e) => sum + e.netAmount, 0),
    )

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

    // Daily net + pending (PENDING status) for chart — one row per calendar day in range
    const dailyNet: { [key: string]: number } = {}
    const dailyPending: { [key: string]: number } = {}
    periodEarnings.forEach((earning) => {
      const dateKey = new Date(earning.createdAt).toISOString().split('T')[0]
      dailyNet[dateKey] = (dailyNet[dateKey] || 0) + earning.netAmount
      if (earning.status === 'PENDING') {
        dailyPending[dateKey] = (dailyPending[dateKey] || 0) + earning.netAmount
      }
    })

    const chartLabels: string[] = []
    const chartNetPoints: number[] = []
    const chartPendingPoints: number[] = []
    const periodEnd = new Date(today)
    periodEnd.setHours(23, 59, 59, 999)
    const cursor = new Date(periodStart)
    while (cursor <= periodEnd) {
      const dateKey = cursor.toISOString().split('T')[0]
      chartLabels.push(cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
      chartNetPoints.push(roundMoney2(dailyNet[dateKey] || 0))
      chartPendingPoints.push(roundMoney2(dailyPending[dateKey] || 0))
      cursor.setDate(cursor.getDate() + 1)
    }

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
        lifetimeBreakdown,
        chartData: {
          labels: chartLabels,
          datasets: [
            { data: chartNetPoints, color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`, strokeWidth: 2 },
            { data: chartPendingPoints, color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`, strokeWidth: 2 },
          ],
          legend: ['Net (period)', 'Pending (status)'],
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




