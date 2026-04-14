import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { systemSettings } from "@/lib/systemSettings"

export async function GET(_request: NextRequest) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const settings = await systemSettings()
    const currencySymbol = typeof settings.currency === "string" ? settings.currency : "₦"

    const baseVendor = { role: "VENDOR" as const }

    const [totalRestaurants, activeRestaurants, pendingApproval, ordersAgg, menuItemCount] = await Promise.all([
      prisma.user.count({
        where: { ...baseVendor, restaurant: { isNot: null } },
      }),
      prisma.user.count({
        where: { ...baseVendor, restaurant: { is: { isVerified: true } } },
      }),
      prisma.user.count({
        where: { ...baseVendor, restaurant: { is: { isVerified: false } } },
      }),
      prisma.order.aggregate({
        where: { module: "FOOD" },
        _sum: { total: true },
        _count: true,
      }),
      prisma.menuItem.count({ where: { isAvailable: true } }),
    ])

    const reviewsAgg = await prisma.review.aggregate({
      where: { order: { module: "FOOD" } },
      _avg: { rating: true },
    })

    return NextResponse.json({
      totalRestaurants,
      activeRestaurants,
      pendingApproval,
      totalRevenue: ordersAgg._sum.total ?? 0,
      totalOrders: ordersAgg._count ?? 0,
      totalMenuItems: menuItemCount,
      averageRating: reviewsAgg._avg.rating ?? 0,
      currencySymbol,
    })
  } catch (error) {
    console.error("Error fetching food module stats:", error)
    return NextResponse.json({ error: "Failed to fetch food stats" }, { status: 500 })
  }
}
