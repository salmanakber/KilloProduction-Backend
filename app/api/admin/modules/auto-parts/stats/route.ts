import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { systemSettings } from "@/lib/systemSettings"
import { buildReportData, parseReportFilters } from "@/app/api/admin/reports/reporting-core"

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

    const [totalStores, pendingApprovals, activeStores, suspendedStores, reportData, reviewsAgg] =
      await Promise.all([
        prisma.autoPartsStore.count(),
        prisma.autoPartsStore.count({ where: { isVerified: false } }),
        prisma.autoPartsStore.count({ where: { isVerified: true, isActive: true } }),
        prisma.autoPartsStore.count({ where: { isActive: false } }),
        buildReportData(parseReportFilters(new URLSearchParams({ module: "AUTO_PARTS", includeLogs: "false" }))),
        prisma.review.aggregate({
          where: { order: { module: "AUTO_PARTS" } },
          _avg: { rating: true },
        }),
      ])

    return NextResponse.json({
      totalStores,
      pendingApprovals,
      activeStores,
      suspendedStores,
      totalRevenue: reportData.summary.grossSales ?? 0,
      totalOrders: reportData.summary.totalOrders ?? 0,
      averageRating: reviewsAgg._avg.rating ?? 0,
      currencySymbol,
    })
  } catch (error) {
    console.error("Error fetching auto-parts module stats:", error)
    return NextResponse.json({ error: "Failed to fetch auto-parts stats" }, { status: 500 })
  }
}
