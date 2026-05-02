import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { parseAdminRange } from "@/lib/adminDateRange"

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range") || "7d"
    const status = (searchParams.get("status") || "ALL").toUpperCase()
    const q = (searchParams.get("q") || "").trim().toLowerCase()
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.max(1, Number.parseInt(searchParams.get("limit") || "20", 10))
    const { start, end } = parseAdminRange(range)

    const rows = await prisma.payment.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    })

    const mapped = rows
      .map((p) => {
        const meta =
          p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
            ? (p.metadata as Record<string, unknown>)
            : {}
        const refund =
          meta.refund && typeof meta.refund === "object" && !Array.isArray(meta.refund)
            ? (meta.refund as Record<string, unknown>)
            : null
        if (!refund) return null
        return {
          id: String(refund.requestId || `RF-${p.id}`),
          paymentId: p.id,
          orderId: String(refund.sourceOrderId || p.orderId || ""),
          transactionId: p.gatewayTransactionId || p.id,
          customerName: p.user?.name || "Unknown",
          customerEmail: p.user?.email || "",
          amount:
            typeof refund.requestedRefundAmount === "number"
              ? refund.requestedRefundAmount
              : Number(refund.requestedRefundAmount || p.amount || 0),
          currency: p.currency,
          reason: String(refund.reason || "N/A"),
          customerNote: String(refund.reason || ""),
          status: String(refund.status || "PENDING"),
          method: String(refund.refundMethod || "ORIGINAL_PAYMENT"),
          requestedAt: String(refund.requestedAt || p.createdAt.toISOString()),
          processedAt: typeof refund.processedAt === "string" ? refund.processedAt : undefined,
          adminNote: typeof refund.adminNote === "string" ? refund.adminNote : undefined,
        }
      })
      .filter(Boolean) as Array<Record<string, unknown>>

    const filtered = mapped.filter((r) => {
      if (status !== "ALL" && String(r.status).toUpperCase() !== status) return false
      if (!q) return true
      return (
        String(r.id).toLowerCase().includes(q) ||
        String(r.orderId || "").toLowerCase().includes(q) ||
        String(r.customerName || "").toLowerCase().includes(q)
      )
    })

    const total = filtered.length
    const pages = Math.max(1, Math.ceil(total / limit))
    const startIndex = (page - 1) * limit
    const pageRows = filtered.slice(startIndex, startIndex + limit)

    const pendingCount = filtered.filter((r) => String(r.status).toUpperCase() === "PENDING").length
    const processedCount = filtered.filter((r) => ["APPROVED", "COMPLETED"].includes(String(r.status).toUpperCase())).length
    const rejectedCount = filtered.filter((r) => ["REJECTED", "FAILED"].includes(String(r.status).toUpperCase())).length
    const resolutionHours = filtered
      .map((r) => {
        const requestedAt = Date.parse(String(r.requestedAt || ""))
        const processedAt = Date.parse(String(r.processedAt || ""))
        if (!requestedAt || !processedAt || processedAt < requestedAt) return null
        return (processedAt - requestedAt) / 3600000
      })
      .filter((x): x is number => typeof x === "number")
    const avgResolutionHours = resolutionHours.length
      ? Number((resolutionHours.reduce((sum, n) => sum + n, 0) / resolutionHours.length).toFixed(1))
      : 0

    return NextResponse.json({
      refunds: pageRows,
      analytics: { pendingCount, processedCount, rejectedCount, avgResolutionHours },
      pagination: { page, limit, total, pages },
    })
  } catch (e) {
    console.error("admin refunds GET:", e)
    return NextResponse.json({ error: "Failed to load refunds" }, { status: 500 })
  }
}
