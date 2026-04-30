import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { buildCsvExport, buildReportData, parseReportFilters } from "../../reporting-core"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await authenticateRequest(request)
    if (!actor?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const reportId = params.id
    const { searchParams } = new URL(request.url)
    const format = (searchParams.get("format") || "CSV").toUpperCase()

    if (!["CSV", "EXCEL", "XLSX"].includes(format)) {
      return NextResponse.json({ error: "Unsupported format. Use CSV or EXCEL." }, { status: 400 })
    }

    const filters = parseReportFilters(searchParams)
    const reportData = await buildReportData(filters)
    const csv = buildCsvExport(reportData)
    const isCsv = format === "CSV"

    return new NextResponse(csv, {
      headers: {
        "Content-Type": isCsv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="report-${reportId}.${isCsv ? "csv" : "xlsx"}"`,
      },
    })
  } catch (error) {
    console.error("Error exporting report:", error)
    return NextResponse.json({ error: "Failed to export report" }, { status: 500 })
  }
}
