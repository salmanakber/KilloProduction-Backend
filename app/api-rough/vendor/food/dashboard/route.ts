import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findFirst({
      where: { vendorId: user.id },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    // Get today's stats
    const [todayOrders, todayRevenue, pendingOrders, totalMenuItems, monthlyStats, totalReviews] = await Promise.all([
      // Today's orders count
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "FOOD",
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
          module: "FOOD",
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
          module: "FOOD",
          status: {
            in: ["PENDING", "CONFIRMED", "PREPARING"],
          },
        },
      }),

      // Total menu items
      prisma.menuItem.count({
        where: {
          restaurantId: restaurant.id,
          isActive: true,
        },
      }),

      // Monthly stats
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "FOOD",
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
          restaurantId: restaurant.id,
        },
        _avg: {
          rating: true,
        },
        _count: {
          id: true,
        },
      }),
    ])

    const dashboardStats = {
      todayOrders,
      todayRevenue: todayRevenue._sum.total || 0,
      pendingOrders,
      totalMenuItems,
      averageRating: totalReviews._avg.rating || 0,
      totalReviews: totalReviews._count.id || 0,
      isRestaurantOpen: restaurant.isOpen,
      monthlyRevenue: monthlyStats._sum.total || 0,
      monthlyOrders: monthlyStats._count.id || 0,
    }

    return NextResponse.json(dashboardStats)
  } catch (error) {
    console.error("Food vendor dashboard error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
