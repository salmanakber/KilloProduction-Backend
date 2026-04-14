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
    const chartRange = (searchParams.get("chartRange") || "daily").toLowerCase()

    const store = await prisma.groceryStore.findFirst({
      where: { userId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    const { txs } = await getVendorMerchandiseCredits({
      vendorUserId: user.id,
      module: "GROCERY",
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const endOfMonthCap = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)

    const settledOrderWhere = {
      vendorId: user.id,
      module: "GROCERY" as const,
      status: { in: ["DELIVERED", "COMPLETED"] as any },
    }

    const [
      todayOrders,
      todayRevenueWallet,
      pendingOrders,
      totalProducts,
      lowStockItems,
      outOfStockItems,
      monthlyRevenueWallet,
      monthlyOrdersDelivered,
      totalReviews,
      totalCustomers,
    ] = await Promise.all([
      prisma.order.count({
        where: { ...settledOrderWhere, createdAt: { gte: today, lt: tomorrow } },
      }),
      Promise.resolve(sumCreditsInRange(txs, today, tomorrow)),
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "GROCERY",
          status: { in: ["PENDING", "CONFIRMED", "PREPARING"] },
        },
      }),
      prisma.groceryProduct.count({
        where: { storeId: store.id, isActive: true },
      }),
      prisma.groceryProduct.count({
        where: { storeId: store.id, isActive: true, stock: { lt: 10, gt: 0 } },
      }),
      prisma.groceryProduct.count({
        where: { storeId: store.id, isActive: true, stock: 0 },
      }),
      Promise.resolve(sumCreditsInRange(txs, startOfMonth, new Date(tomorrow.getTime()))),
      prisma.order.count({
        where: {
          ...settledOrderWhere,
          createdAt: { gte: startOfMonth, lte: endOfMonthCap },
        },
      }),
      prisma.review.aggregate({
        where: { groceryId: store.id },
        _avg: { rating: true },
        _count: { id: true },
      }),
      prisma.order.findMany({
        where: { vendorId: user.id, module: "GROCERY" },
        select: { customerId: true },
        distinct: ["customerId"],
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
          where: { ...settledOrderWhere, createdAt: { gte: start, lte: end } },
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
          where: { ...settledOrderWhere, createdAt: { gte: start, lte: end } },
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
          where: { ...settledOrderWhere, createdAt: { gte: date, lt: nextDay } },
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
      totalProducts,
      lowStockItems,
      outOfStockItems,
      averageRating: totalReviews._avg.rating || 0,
      totalReviews: totalReviews._count.id || 0,
      isStoreOpen: store.isOpen,
      monthlyRevenue: monthlyRevenueWallet,
      monthlyOrders: monthlyOrdersDelivered,
      totalCustomers: totalCustomers.length,
      weeklyData: weekData,
      chartRange,
      revenueSource: "wallet_delivered",
    }

    return NextResponse.json(dashboardStats)
  } catch (error) {
    console.error("Grocery vendor dashboard error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
