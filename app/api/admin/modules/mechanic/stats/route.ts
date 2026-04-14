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

    const [totalMechanics, pendingApprovals, activeMechanics, suspendedMechanics, ordersAgg, reviewsAgg] =
      await Promise.all([
        prisma.mechanicProfile.count(),
        prisma.mechanicProfile.count({ where: { isVerified: false } }),
        prisma.mechanicProfile.count({ where: { isVerified: true, isActive: true } }),
        prisma.mechanicProfile.count({ where: { isActive: false } }),
        prisma.order.aggregate({
          where: { module: "AUTO_PARTS" },
          _sum: { total: true },
          _count: true,
        }),
        prisma.review.aggregate({
          where: { mechanicId: { not: null } },
          _avg: { rating: true },
        }),
      ])

    return NextResponse.json({
      totalMechanics,
      pendingApprovals,
      activeMechanics,
      suspendedMechanics,
      totalRevenue: ordersAgg._sum.total ?? 0,
      totalOrders: ordersAgg._count ?? 0,
      averageRating: reviewsAgg._avg.rating ?? 0,
      currencySymbol,
    })
  } catch (error) {
    console.error("Error fetching mechanic module stats:", error)
    return NextResponse.json({ error: "Failed to fetch mechanic stats" }, { status: 500 })
  }
}
