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

    const [totalPharmacies, pendingApprovals, activePharmacies, suspendedPharmacies, ordersData, reviewsData] =
      await Promise.all([
        prisma.pharmacy.count(),
        prisma.pharmacy.count({ where: { status: "PENDING" } }),
        prisma.pharmacy.count({ where: { status: "APPROVED" } }),
        prisma.pharmacy.count({ where: { status: "SUSPENDED" } }),
        buildReportData(parseReportFilters(new URLSearchParams({ module: "PHARMACY", includeLogs: "false" }))),
        prisma.review.aggregate({
          where: {
            order: { module: "PHARMACY" },
          },
          _avg: { rating: true },
        }),
      ])

    const stats = {
      totalPharmacies,
      pendingApprovals,
      activePharmacies,
      suspendedPharmacies,
      totalRevenue: ordersData.summary.grossSales || 0,
      totalOrders: ordersData.summary.totalOrders || 0,
      averageRating: reviewsData._avg.rating || 0,
      currencySymbol,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("Error fetching pharmacy stats:", error)
    return NextResponse.json({ error: "Failed to fetch pharmacy stats" }, { status: 500 })
  }
}
