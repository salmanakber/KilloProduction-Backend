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
    const chartRange = (searchParams.get("chartRange") || "weekly").toLowerCase()

    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const { txs } = await getVendorMerchandiseCredits({
      vendorUserId: user.id,
      module: "FOOD",
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const endOfMonthCap = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)

    const settledOrderWhere = {
      vendorId: user.id,
      module: "FOOD" as const,
      status: { in: ["DELIVERED", "COMPLETED"] as any },
    }

    const [todayOrders, todayRevenueWallet, pendingOrders, totalMenuItems, monthlyRevenueWallet, monthlyOrdersDelivered, totalReviews] =
      await Promise.all([
        prisma.order.count({
          where: {
            ...settledOrderWhere,
            createdAt: { gte: today, lt: tomorrow },
          },
        }),
        Promise.resolve(sumCreditsInRange(txs, today, tomorrow)),
        prisma.order.count({
          where: {
            vendorId: user.id,
            module: "FOOD",
            status: {
              in: ["PENDING", "CONFIRMED", "PREPARING"],
            },
          },
        }),
        prisma.menuItem.count({
          where: {
            restaurantId: restaurant.id,
            isAvailable: true,
          },
        }),
        Promise.resolve(sumCreditsInRange(txs, startOfMonth, new Date(tomorrow.getTime()))),
        prisma.order.count({
          where: {
            ...settledOrderWhere,
            createdAt: { gte: startOfMonth, lte: endOfMonthCap },
          },
        }),
        prisma.review.aggregate({
          where: {
            foodId: restaurant.id,
          },
          _avg: {
            rating: true,
          },
          _count: {
            id: true,
          },
        }),
      ])

    const weekData: { day: string; revenue: number; orders: number }[] = []

    if (chartRange === "monthly") {
      for (let m = 5; m >= 0; m--) {
        const start = new Date(today.getFullYear(), today.getMonth() - m, 1, 0, 0, 0, 0)
        const end = new Date(today.getFullYear(), today.getMonth() - m + 1, 0, 23, 59, 59, 999)
        const next = new Date(end.getTime() + 1)
        const revenue = sumCreditsInRange(txs, start, next)
        const orders = await prisma.order.count({
          where: {
            ...settledOrderWhere,
            createdAt: { gte: start, lte: end },
          },
        })
        weekData.push({
          day: start.toLocaleString("en-US", { month: "short" }),
          revenue,
          orders,
        })
      }
    } else if (chartRange === "weekly") {
      for (let w = 7; w >= 0; w--) {
        const end = new Date(today)
        end.setDate(end.getDate() - w * 7)
        end.setHours(23, 59, 59, 999)
        const start = new Date(end)
        start.setDate(start.getDate() - 6)
        start.setHours(0, 0, 0, 0)
        const next = new Date(end.getTime() + 1)
        const revenue = sumCreditsInRange(txs, start, next)
        const orders = await prisma.order.count({
          where: {
            ...settledOrderWhere,
            createdAt: { gte: start, lte: end },
          },
        })
        weekData.push({
          day: `W${8 - w}`,
          revenue,
          orders,
        })
      }
    } else {
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        date.setHours(0, 0, 0, 0)
        const nextDay = new Date(date)
        nextDay.setDate(nextDay.getDate() + 1)

        const revenue = sumCreditsInRange(txs, date, nextDay)
        const orders = await prisma.order.count({
          where: {
            ...settledOrderWhere,
            createdAt: { gte: date, lt: nextDay },
          },
        })

        const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        weekData.push({
          day: dayLabels[date.getDay()],
          revenue,
          orders,
        })
      }
    }

    const dashboardStats = {
      todayOrders,
      todayRevenue: todayRevenueWallet,
      pendingOrders,
      totalMenuItems,
      averageRating: totalReviews._avg.rating || 0,
      totalReviews: totalReviews._count.id || 0,
      isRestaurantOpen: restaurant.isOpen,
      monthlyRevenue: monthlyRevenueWallet,
      monthlyOrders: monthlyOrdersDelivered,
      weeklyData: weekData,
      chartRange,
      /** Sum of completed vendor merchandise credits (delivered orders), not order.total */
      revenueSource: "wallet_delivered",
    }

    return NextResponse.json(dashboardStats)
  } catch (error) {
    console.error("Food vendor dashboard error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
