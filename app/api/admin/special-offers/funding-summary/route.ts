import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { metricsForOfferLine } from "@/lib/special-offer-line-metrics"

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? fallback : d
}

function overlapOrNull(a0: Date, a1: Date, b0: Date, b1: Date): [Date, Date] | null {
  const s = new Date(Math.max(a0.getTime(), b0.getTime()))
  const e = new Date(Math.min(a1.getTime(), b1.getTime()))
  if (s.getTime() > e.getTime()) return null
  return [s, e]
}

// GET /api/admin/special-offers/funding-summary?from=&to=
// Aggregates live delivered-order metrics for special offers overlapping the date range.
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const filterFrom = parseDate(searchParams.get("from"), defaultFrom)
    const filterTo = parseDate(searchParams.get("to"), now)
    if (filterFrom > filterTo) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 })
    }

    const offers = await prisma.specialOffer.findMany({
      where: {
        validFrom: { lte: filterTo },
        validUntil: { gte: filterFrom },
      },
      select: {
        id: true,
        title: true,
        module: true,
        discountType: true,
        discountValue: true,
        discountFundedBy: true,
        validFrom: true,
        validUntil: true,
      },
    })

    let totalDiscountPlatform = 0
    let totalDiscountVendor = 0
    let totalGrossSales = 0
    let totalOrders = 0
    let totalUnits = 0

    const byOffer: Array<{
      offerId: string
      title: string
      module: string
      totalOrders: number
      totalUnits: number
      grossSales: number
      discountPlatform: number
      discountVendor: number
      netVendorMerchandise: number
    }> = []

    for (const offer of offers) {
      const overlap = overlapOrNull(
        new Date(offer.validFrom),
        new Date(offer.validUntil),
        filterFrom,
        filterTo,
      )
      if (!overlap) continue

      const [from, to] = overlap

      const offerTerms = {
        id: offer.id,
        discountType: offer.discountType as string | null,
        discountValue: offer.discountValue != null ? Number(offer.discountValue) : null,
        discountFundedBy: offer.discountFundedBy as string | null,
      }

      const mod = offer.module as any

      const submissions = await prisma.specialOfferSubmission.findMany({
        where: { offerId: offer.id },
      })

      let offerOrders = 0
      let offerUnits = 0
      let offerGross = 0
      let offerDiscPlat = 0
      let offerDiscVen = 0
      let offerNetVen = 0

      for (const sub of submissions) {
        const productId = sub.productId
        const vendorId = sub.vendorId

        const orders = await prisma.order.findMany({
          where: {
            vendorId,
            module: mod,
            status: "DELIVERED" as any,
            createdAt: { gte: from, lte: to },
          },
          include: { orderItems: true },
        })

        for (const order of orders as any[]) {
          let hasMatchedItem = false
          for (const item of order.orderItems as any[]) {
            if (String(item.productId) !== productId) continue
            hasMatchedItem = true
            const qty = Number(item.quantity || 0)
            const m = metricsForOfferLine(offerTerms, {
              quantity: qty,
              unitPrice: Number(item.unitPrice || 0),
              customizations: item.customizations,
            })
            offerUnits += qty
            offerGross += m.grossSales
            offerDiscPlat += m.discountPlatform
            offerDiscVen += m.discountVendor
            offerNetVen += m.netVendorMerchandise
          }
          if (hasMatchedItem) offerOrders += 1
        }
      }

      totalOrders += offerOrders
      totalUnits += offerUnits
      totalGrossSales += offerGross
      totalDiscountPlatform += offerDiscPlat
      totalDiscountVendor += offerDiscVen

      byOffer.push({
        offerId: offer.id,
        title: offer.title,
        module: String(offer.module || ""),
        totalOrders: offerOrders,
        totalUnits: offerUnits,
        grossSales: offerGross,
        discountPlatform: offerDiscPlat,
        discountVendor: offerDiscVen,
        netVendorMerchandise: offerNetVen,
      })
    }

    return NextResponse.json({
      success: true,
      range: { from: filterFrom.toISOString(), to: filterTo.toISOString() },
      totals: {
        totalOrders,
        totalUnits,
        grossSales: totalGrossSales,
        discountPlatform: totalDiscountPlatform,
        discountVendor: totalDiscountVendor,
      },
      byOffer: byOffer.filter(
        (o) =>
          o.totalOrders > 0 ||
          o.totalUnits > 0 ||
          o.grossSales > 0 ||
          o.discountPlatform > 0 ||
          o.discountVendor > 0,
      ),
    })
  } catch (error: any) {
    console.error("Admin funding-summary error:", error)
    return NextResponse.json({ error: "Failed to load funding summary" }, { status: 500 })
  }
}
