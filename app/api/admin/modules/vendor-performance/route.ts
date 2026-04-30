import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildReportData, parseReportFilters } from "@/app/api/admin/reports/reporting-core"
import { systemSettings } from "@/lib/systemSettings"

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return ""
  const raw = String(value)
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) return `"${raw.replaceAll('"', '""')}"`
  return raw
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "id,type,status,message,createdAt,amount\n"
  const headers = Object.keys(rows[0])
  const lines = [headers.join(",")]
  for (const row of rows) {
    lines.push(headers.map((key) => escapeCsv(row[key])).join(","))
  }
  return lines.join("\n")
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get("vendorId")
    const moduleKey = (searchParams.get("module") || "ALL").toUpperCase()
    const page = Math.max(1, Number(searchParams.get("page") || "1"))
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || "10")))
    const exportType = (searchParams.get("export") || "").toLowerCase()
    if (!vendorId) return NextResponse.json({ error: "vendorId is required" }, { status: 400 })
    const settings = await systemSettings()
  
    const currencySymbol = typeof settings.currency === "string" ? settings.currency : "₦"
    

    if (moduleKey === "MECHANIC") {
      const profile = await prisma.mechanicProfile.findUnique({
        where: { userId: vendorId },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          expertise: true,
        },
      })
      if (!profile) return NextResponse.json({ error: "Mechanic profile not found" }, { status: 404 })

      const [requestAgg, offerAgg, acceptedOfferAgg, totalOffersCount, quoteAgg, acceptedQuoteAgg, requestTimeline, offerTimeline, recentRequests, recentOffers, completedRequests] = await Promise.all([
        prisma.mechanicServiceRequest.aggregate({
          where: { mechanicId: profile.id },
          _count: true,
        }),
        prisma.mechanicOffer.aggregate({
          where: { mechanicId: vendorId },
          _count: true,
          _sum: { totalAmount: true },
        }),
        prisma.mechanicOffer.aggregate({
          where: {
            mechanicId: vendorId,
            status: "ACCEPTED",
            serviceRequest: {
              status: "COMPLETED",
            },
          },
          _sum: { totalAmount: true },
        }),
        prisma.mechanicOffer.count({
          where: { mechanicId: vendorId },
        }),
        prisma.mechanicQuote.aggregate({
          where: { mechanicId: vendorId },
          _count: true,
          _sum: { totalAmount: true },
        }),
        prisma.mechanicQuote.aggregate({
          where: {
            mechanicId: vendorId,
            status: "ACCEPTED",
          },
          _sum: { totalAmount: true },
        }),
        prisma.mechanicServiceRequest.findMany({
          where: { mechanicId: profile.id },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        prisma.mechanicOffer.findMany({
          where: { mechanicId: vendorId },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        prisma.mechanicServiceRequest.findMany({
          where: { mechanicId: profile.id },
          orderBy: { createdAt: "desc" },
          take: page * limit,
          select: { id: true, status: true, issueDescription: true, createdAt: true },
        }),
        prisma.mechanicOffer.findMany({
          where: { mechanicId: vendorId },
          orderBy: { createdAt: "desc" },
          take: page * limit,
          select: { id: true, status: true, totalAmount: true, createdAt: true },
        }),
        prisma.mechanicServiceRequest.findMany({
          where: {
            mechanicId: profile.id,
            status: "COMPLETED",
          },
          select: {
            id: true,
            offers: {
              where: { status: "ACCEPTED" },
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: { totalAmount: true },
            },
            quote: {
              select: { totalAmount: true, status: true },
            },
          },
        }),
      ])

      const fullActivity = [
        ...recentRequests.map((row) => ({
          id: `sr-${row.id}`,
          type: "SERVICE_REQUEST",
          status: row.status,
          message: row.issueDescription,
          createdAt: row.createdAt,
          amount: null as number | null,
        })),
        ...recentOffers.map((row) => ({
          id: `of-${row.id}`,
          type: "MECHANIC_OFFER",
          status: row.status,
          amount: row.totalAmount,
          message: "Offer submitted",
          createdAt: row.createdAt,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const totalActivity = (requestAgg._count || 0) + (totalOffersCount || 0)
      const paginatedActivity = fullActivity.slice((page - 1) * limit, page * limit)

      const chartMap = new Map<string, { date: string; requests: number; offers: number }>()
      for (const row of requestTimeline) {
        const date = row.createdAt.toISOString().slice(0, 10)
        const slot = chartMap.get(date) || { date, requests: 0, offers: 0 }
        slot.requests += 1
        chartMap.set(date, slot)
      }
      for (const row of offerTimeline) {
        const date = row.createdAt.toISOString().slice(0, 10)
        const slot = chartMap.get(date) || { date, requests: 0, offers: 0 }
        slot.offers += 1
        chartMap.set(date, slot)
      }
      const chartData = Array.from(chartMap.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-14)

      const completedRevenue = completedRequests.reduce((sum, req) => {
        const acceptedOfferAmount = req.offers[0]?.totalAmount
        const acceptedQuoteAmount =
          req.quote && req.quote.status === "ACCEPTED" && typeof req.quote.totalAmount === "number"
            ? req.quote.totalAmount
            : null
        const amount = acceptedOfferAmount ?? acceptedQuoteAmount ?? 0
        return sum + amount
      }, 0)
      const acceptedOfferRevenue = acceptedOfferAgg?._sum?.totalAmount || 0
      const acceptedQuoteRevenue = acceptedQuoteAgg?._sum?.totalAmount || 0
      const grossSales =
        completedRevenue ||
        acceptedOfferRevenue ||
        acceptedQuoteRevenue ||
        offerAgg?._sum?.totalAmount ||
        quoteAgg?._sum?.totalAmount ||
        0

      if (exportType === "csv") {
        const csv = toCsv(fullActivity.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() })))
        return new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="mechanic-${vendorId}-activity.csv"`,
          },
        })
      }

      return NextResponse.json({
        module: "MECHANIC",
        currencySymbol,
        vendor: {
          id: profile.userId,
          name: profile.businessName || profile.user.name,
          email: profile.email || profile.user.email,
          phone: profile.phone || profile.user.phone,
          profile,
        },
        summary: {
          totalJobs: requestAgg._count || 0,
          completedJobs: completedRequests.length || 0,
          totalOrders: requestAgg._count || 0,
          grossSales,
          netProfitOrLoss: grossSales,
          totalRequests: requestAgg._count || 0,
          totalQuotes: quoteAgg._count || 0,
          totalQuoteValue: quoteAgg._sum?.totalAmount || 0,
        },
        recentActivity: paginatedActivity,
        activityPagination: {
          page,
          limit,
          total: totalActivity,
          pages: Math.max(1, Math.ceil(totalActivity / limit)),
        },
        chartData,
      })
    }

    const params = new URLSearchParams(searchParams)
    params.set("vendorId", vendorId)
    params.set("includeLogs", "true")
    if (moduleKey !== "ALL") params.set("module", moduleKey)
    const reportData = await buildReportData(parseReportFilters(params))
    const where = {
      vendorId,
      ...(moduleKey !== "ALL" ? { module: moduleKey as any } : {}),
    }
    const [recentActivity, totalActivity] = await Promise.all([
      prisma.order.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          total: true,
          createdAt: true,
        },
      }),
      prisma.order.count({ where }),
    ])

    if (exportType === "csv") {
      const allRows = await prisma.order.findMany({
      where: {
        vendorId,
        ...(moduleKey !== "ALL" ? { module: moduleKey as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        total: true,
        createdAt: true,
      },
    })
      const csv = toCsv(
        allRows.map((row) => ({
          id: row.id,
          orderNumber: row.orderNumber,
          status: row.status,
          paymentStatus: row.paymentStatus,
          total: row.total,
          createdAt: row.createdAt.toISOString(),
        })),
      )
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${moduleKey.toLowerCase()}-${vendorId}-orders.csv"`,
        },
      })
    }

    return NextResponse.json({
      module: moduleKey,
      vendorId,
      currencySymbol,
      summary: reportData.summary,
      discounts: reportData.discounts,
      breakdown: reportData.breakdown,
      drilldown: reportData.drilldown,
      recentActivity,
      activityPagination: {
        page,
        limit,
        total: totalActivity,
        pages: Math.max(1, Math.ceil(totalActivity / limit)),
      },
      chartData: (reportData.trends?.daily || []).slice(-14),
    })
  } catch (error) {
    console.error("Error loading vendor performance:", error)
    return NextResponse.json({ error: "Failed to load vendor performance" }, { status: 500 })
  }
}
