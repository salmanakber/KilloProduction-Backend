import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's grocery store
    const store = await prisma.groceryStore.findFirst({
      where: { vendorId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    // Get today's stats
    const [
      todayOrders,
      todayRevenue,
      pendingOrders,
      totalProducts,
      lowStockItems,
      outOfStockItems,
      monthlyStats,
      totalReviews,
      totalCustomers,
    ] = await Promise.all([
      // Today's orders count
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "GROCERY",
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),

      // Today's revenue
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "GROCERY",
          paymentStatus: "PAID",
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        _sum: {
          total: true,
        },
      }),

      // Pending orders
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "GROCERY",
          status: {
            in: ["PENDING", "CONFIRMED", "PREPARING"],
          },
        },
      }),

      // Total products
      prisma.groceryProduct.count({
        where: {
          storeId: store.id,
          isActive: true,
        },
      }),

      // Low stock items (stock < 10)
      prisma.groceryProduct.count({
        where: {
          storeId: store.id,
          isActive: true,
          stock: {
            lt: 10,
            gt: 0,
          },
        },
      }),

      // Out of stock items
      prisma.groceryProduct.count({
        where: {
          storeId: store.id,
          isActive: true,
          stock: 0,
        },
      }),

      // Monthly stats
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "GROCERY",
          paymentStatus: "PAID",
          createdAt: {
            gte: startOfMonth,
          },
        },
        _sum: {
          total: true,
        },
        _count: {
          id: true,
        },
      }),

      // Reviews
      prisma.review.aggregate({
        where: {
          groceryStoreId: store.id,
        },
        _avg: {
          rating: true,
        },
        _count: {
          id: true,
        },
      }),

      // Total unique customers
      prisma.order.findMany({
        where: {
          vendorId: user.id,
          module: "GROCERY",
        },
        select: {
          customerId: true,
        },
        distinct: ["customerId"],
      }),
    ])

    const dashboardStats = {
      todayOrders,
      todayRevenue: todayRevenue._sum.total || 0,
      pendingOrders,
      totalProducts,
      lowStockItems,
      outOfStockItems,
      averageRating: totalReviews._avg.rating || 0,
      totalReviews: totalReviews._count.id || 0,
      isStoreOpen: store.isOpen,
      monthlyRevenue: monthlyStats._sum.total || 0,
      monthlyOrders: monthlyStats._count.id || 0,
      totalCustomers: totalCustomers.length,
    }

    return NextResponse.json(dashboardStats)
  } catch (error) {
    console.error("Grocery vendor dashboard error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
