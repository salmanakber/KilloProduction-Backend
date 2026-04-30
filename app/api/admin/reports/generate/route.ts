import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { buildReportData, parseReportFilters } from "../reporting-core"

export async function POST(request: NextRequest) {
  try {
    const actor = await authenticateRequest(request)
    if (!actor?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { type = "COMPREHENSIVE", module = "ALL", dateRange = "30d" } = await request.json()

    const search = new URLSearchParams({
      range: String(dateRange).toLowerCase(),
      module: String(module).toUpperCase(),
      includeLogs: "true",
      logLimit: "100",
    })
    const filters = parseReportFilters(search)
    const reportData = await buildReportData(filters)

    const reportId = `RPT-${Date.now()}`
    const systemSettings = await prisma.systemSettings.findFirst({
      select: { currency: true, defaultCurrency: true },
    })
    const currency = systemSettings?.defaultCurrency || systemSettings?.currency || "USD"

    await prisma.auditLog.create({
      data: {
        performedBy: actor.id,
        action: "GENERATE_ADMIN_REPORT",
        entityType: "REPORT",
        entityId: reportId,
        details: {
          type,
          module: filters.module,
          range: filters.range,
          summary: reportData.summary,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Report generated successfully",
      report: {
        id: reportId,
        name: `${String(type).toUpperCase()} Report - ${new Date().toLocaleDateString()}`,
        type: String(type).toUpperCase(),
        module: filters.module,
        dateRange: {
          start: filters.startDate.toISOString(),
          end: filters.endDate.toISOString(),
        },
        status: "COMPLETED",
        currency,
        generatedAt: new Date().toISOString(),
        generatedBy: actor.name || "Admin User",
      },
    })
  } catch (error) {
    console.error("Error generating report:", error)
    const message = error instanceof Error ? error.message : "Failed to generate report"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
