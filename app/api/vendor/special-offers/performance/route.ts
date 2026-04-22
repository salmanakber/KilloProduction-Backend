import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { metricsForOfferLine } from "@/lib/special-offer-line-metrics"
import { platformFundedDeltaForOrder } from "@/lib/order-special-offer-pricing"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const moduleParam = searchParams.get("module") as
      | "PHARMACY"
      | "GROCERY"
      | "FOOD"
      | "AUTO_PARTS"
      | null

    const submissions = await prisma.specialOfferSubmission.findMany({
      where: {
        vendorId: user.id,
        ...(moduleParam ? { module: moduleParam as any } : {}),
      },
      include: {
        offer: true,
      },
    })

    const performance: any[] = []

    for (const sub of submissions as any[]) {
      const offer = sub.offer
      if (!offer?.id) continue
      const from = new Date(offer.validFrom)
      const to = new Date(offer.validUntil)
      const module = offer.module as "PHARMACY" | "GROCERY" | "FOOD" | "AUTO_PARTS"
      const productId = sub.productId as string

      const offerTerms = {
        id: offer.id as string,
        discountType: offer.discountType as string | null,
        discountValue: offer.discountValue != null ? Number(offer.discountValue) : null,
        discountFundedBy: offer.discountFundedBy as string | null,
      }

      const orders = await prisma.order.findMany({
        where: {
          vendorId: user.id,
          module: module as any,
          status: "DELIVERED" as any,
          createdAt: { gte: from, lte: to },
        },
        include: { orderItems: true },
      })

      let totalUnits = 0
      let totalOrders = 0
      let grossSales = 0
      let discountPlatform = 0
      let discountVendor = 0
      let netVendorMerchandise = 0
      let vendorCommissionAllocated = 0

      const weeklySeries: { label: string; grossSales: number; netVendorMerchandise: number }[] = []
      const weekMs = 7 * 24 * 60 * 60 * 1000
      let weekBuckets = 0
      for (let w = from.getTime(); w <= to.getTime() && weekBuckets < 26; w += weekMs) {
        weekBuckets += 1
        const wEnd = Math.min(w + weekMs - 1, to.getTime())
        const wFrom = new Date(w)
        const wTo = new Date(wEnd)
        let wg = 0
        let wn = 0
        for (const order of orders as any[]) {
          const oc = new Date(order.createdAt).getTime()
          if (oc < wFrom.getTime() || oc > wTo.getTime()) continue
          for (const item of order.orderItems as any[]) {
            if (String(item.productId) !== productId) continue
            const qty = Number(item.quantity || 0)
            const unitPrice = Number(item.unitPrice || 0)
            const m = metricsForOfferLine(offerTerms, {
              quantity: qty,
              unitPrice,
              customizations: item.customizations,
            })
            wg += m.grossSales
            const platformDelta =
              m.discountPlatform > 0
                ? 0
                : platformFundedDeltaForOrder(order.metadata, module, {
                    productId,
                    offerId: offer.id,
                  })
            wn += m.netVendorMerchandise + platformDelta
          }
        }
        weeklySeries.push({
          label: `${wFrom.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
          grossSales: wg,
          netVendorMerchandise: wn,
        })
      }

      for (const order of orders as any[]) {
        let hasMatchedItem = false
        for (const item of order.orderItems as any[]) {
          if (String(item.productId) !== productId) continue
          hasMatchedItem = true
          const qty = Number(item.quantity || 0)
          const unitPrice = Number(item.unitPrice || 0)
          totalUnits += qty
          const m = metricsForOfferLine(offerTerms, {
            quantity: qty,
            unitPrice,
            customizations: item.customizations,
          })
          const platformDelta =
            m.discountPlatform > 0
              ? 0
              : platformFundedDeltaForOrder(order.metadata, module, {
                  productId,
                  offerId: offer.id,
                })
          grossSales += m.grossSales
          discountPlatform += m.discountPlatform + platformDelta
          discountVendor += m.discountVendor
          netVendorMerchandise += m.netVendorMerchandise + platformDelta
        }
        if (hasMatchedItem) {
          totalOrders += 1
        }
      }

      for (const order of orders as any[]) {
        let matchedGross = 0
        let hasMatched = false
        for (const item of order.orderItems as any[]) {
          if (String(item.productId) !== productId) continue
          hasMatched = true
          const qty = Number(item.quantity || 0)
          const unitPrice = Number(item.unitPrice || 0)
          const m = metricsForOfferLine(offerTerms, {
            quantity: qty,
            unitPrice,
            customizations: item.customizations,
          })
          matchedGross += m.grossSales
        }
        if (hasMatched) {
          const st = Number(order.subtotal || 0)
          const ovc = Number(order.vendorCommission || 0)
          if (st > 0 && ovc > 0) {
            vendorCommissionAllocated += (ovc * matchedGross) / st
          }
        }
      }

      const netAfterVendorCommission = Math.max(
        0,
        Math.round((netVendorMerchandise - vendorCommissionAllocated) * 100) / 100,
      )

      performance.push({
        offerId: offer.id,
        offerTitle: offer.title,
        module,
        submissionId: sub.id,
        productId,
        status: sub.status,
        validFrom: offer.validFrom,
        validUntil: offer.validUntil,
        totalUnits,
        totalOrders,
        grossSales,
        discountPlatform,
        discountVendor,
        netVendorMerchandise,
        vendorCommissionAllocated: Math.round(vendorCommissionAllocated * 100) / 100,
        netAfterVendorCommission,
        weeklySeries,
      })
    }

    const summary = performance.reduce(
      (acc, p: any) => {
        acc.totalOffers = new Set([...(acc._ids as any), p.offerId]).size
        acc.totalUnits += p.totalUnits
        acc.totalOrders += p.totalOrders
        acc.totalRevenue += p.netVendorMerchandise
        acc.grossSales += p.grossSales
        acc.vendorCommissionAllocated += Number(p.vendorCommissionAllocated || 0)
        acc.netAfterVendorCommission += Number(p.netAfterVendorCommission || 0)
        ;(acc._ids as any).add(p.offerId)
        return acc
      },
      {
        totalOffers: 0,
        totalUnits: 0,
        totalOrders: 0,
        totalRevenue: 0,
        grossSales: 0,
        vendorCommissionAllocated: 0,
        netAfterVendorCommission: 0,
        _ids: new Set<string>(),
      } as any,
    )
    delete summary._ids

    

    return NextResponse.json({
      success: true,
      submissions: performance,
      summary,
    })
  } catch (error: any) {
    console.error("Vendor special-offers performance error:", error)
    return NextResponse.json(
      { error: "Failed to load offer performance" },
      { status: 500 },
    )
  }
}

