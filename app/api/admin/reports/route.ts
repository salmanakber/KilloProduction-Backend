import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { buildCsvExport, buildReportData, parseReportFilters } from "./reporting-core"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const actor = await prisma.user.findUnique({ where: { id: session.id }, select: { role: true } })
    if (!actor || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const filters = parseReportFilters(searchParams)
    const reportData = await buildReportData(filters)
    const exportFormat = (searchParams.get("export") || "").toUpperCase()

    const defaultCurrency = await prisma.currency.findFirst({
      where: { isDefault: true },
      select: { symbol: true, code: true },
    })
    const currencyCode = defaultCurrency?.code || "NGN"

    if (exportFormat === "CSV" || exportFormat === "EXCEL" || exportFormat === "XLSX") {
      const csv = buildCsvExport(reportData)
      const fileType =
        exportFormat === "CSV"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      const extension = exportFormat === "CSV" ? "csv" : "xlsx"
      const filename = `report-${filters.module}-${filters.startDate.toISOString().slice(0, 10)}-${filters.endDate.toISOString().slice(0, 10)}.${extension}`

      return new NextResponse(csv, {
        headers: {
          "Content-Type": fileType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    return NextResponse.json({ reportData, currencyCode })
  } catch (error) {
    console.error("Error generating report:", error)
    const message = error instanceof Error ? error.message : "Failed to generate report"
    const isValidationError = message.toLowerCase().includes("invalid") || message.includes("startDate")
    return NextResponse.json({ error: message }, { status: isValidationError ? 400 : 500 })
  }
}
