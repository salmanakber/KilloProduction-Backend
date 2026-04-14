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

    const [totalStores, activeStores, pendingApproval, ordersAgg, productCount] = await Promise.all([
      prisma.user.count({
        where: { ...baseVendor, groceryStore: { isNot: null } },
      }),
      prisma.user.count({
        where: { ...baseVendor, groceryStore: { is: { isVerified: true } } },
      }),
      prisma.user.count({
        where: { ...baseVendor, groceryStore: { is: { isVerified: false } } },
      }),
      prisma.order.aggregate({
        where: { module: "GROCERY" },
        _sum: { total: true },
        _count: true,
      }),
      prisma.groceryProduct.count({ where: { isActive: true } }),
    ])

    const reviewsAgg = await prisma.review.aggregate({
      where: { order: { module: "GROCERY" } },
      _avg: { rating: true },
    })

    return NextResponse.json({
      totalStores,
      activeStores,
      pendingApproval,
      totalRevenue: ordersAgg._sum.total ?? 0,
      totalOrders: ordersAgg._count ?? 0,
      totalProducts: productCount,
      averageRating: reviewsAgg._avg.rating ?? 0,
      currencySymbol,
    })
  } catch (error) {
    console.error("Error fetching grocery module stats:", error)
    return NextResponse.json({ error: "Failed to fetch grocery stats" }, { status: 500 })
  }
}
