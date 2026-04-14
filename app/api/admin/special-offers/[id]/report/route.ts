import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { metricsForOfferLine } from "@/lib/special-offer-line-metrics"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const live = searchParams.get("live") === "1"

    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const offer = await prisma.specialOffer.findUnique({
      where: { id: params.id },
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
    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    if (live) {
      const fullOffer = await prisma.specialOffer.findUnique({ where: { id: params.id } })
      if (!fullOffer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })

      const submissions = await prisma.specialOfferSubmission.findMany({
        where: { offerId: params.id },
      })
      const from = new Date(fullOffer.validFrom)
      const to = new Date(fullOffer.validUntil)
      const mod = fullOffer.module as any

      const offerTerms = {
        id: fullOffer.id,
        discountType: fullOffer.discountType as string | null,
        discountValue: fullOffer.discountValue != null ? Number(fullOffer.discountValue) : null,
        discountFundedBy: fullOffer.discountFundedBy as string | null,
      }

      const vendorsFormatted: any[] = []
      let overall = {
        totalOrders: 0,
        totalUnits: 0,
        grossSales: 0,
        discountPlatform: 0,
        discountVendor: 0,
        netVendorMerchandise: 0,
      }

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

        let totalUnits = 0
        let totalOrders = 0
        let grossSales = 0
        let discountPlatform = 0
        let discountVendor = 0
        let netVendorMerchandise = 0

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
            totalUnits += qty
            grossSales += m.grossSales
            discountPlatform += m.discountPlatform
            discountVendor += m.discountVendor
            netVendorMerchandise += m.netVendorMerchandise
          }
          if (hasMatchedItem) totalOrders += 1
        }

        const vu = await prisma.user.findUnique({
          where: { id: vendorId },
          select: { name: true },
        })

        vendorsFormatted.push({
          vendorId,
          vendorName: vu?.name || "Vendor",
          totalOrders,
          totalUnits,
          grossSales,
          discountPlatform,
          discountVendor,
          netVendorMerchandise,
        })

        overall.totalOrders += totalOrders
        overall.totalUnits += totalUnits
        overall.grossSales += grossSales
        overall.discountPlatform += discountPlatform
        overall.discountVendor += discountVendor
        overall.netVendorMerchandise += netVendorMerchandise
      }

      return NextResponse.json({
        success: true,
        offer,
        summary: overall,
        vendors: vendorsFormatted,
        source: "live_orders",
      })
    }

    const rows = await prisma.specialOfferReport.findMany({
      where: { offerId: params.id },
    })

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        success: true,
        offer,
        summary: null,
        vendors: [],
      })
    }

    const overall = rows.reduce(
      (acc, r) => {
        acc.totalOrders += r.totalOrders
        acc.totalUnits += r.totalUnits
        acc.grossSales += r.grossSales
        acc.discountPlatform += r.discountPlatform
        acc.discountVendor += r.discountVendor
        return acc
      },
      {
        totalOrders: 0,
        totalUnits: 0,
        grossSales: 0,
        discountPlatform: 0,
        discountVendor: 0,
      },
    )

    const vendors = await prisma.specialOfferReport.findMany({
      where: { offerId: params.id, vendorId: { not: null } },
      include: {
        offer: false,
        // Join to vendor user for name
        // We can't include vendor relation directly because model is defined only to offer
      },
    })

    // Hydrate vendor names separately
    const vendorIds = Array.from(
      new Set(
        vendors
          .map((r) => r.vendorId)
          .filter((v): v is string => !!v),
      ),
    )
    const vendorUsers =
      vendorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: vendorIds } },
            select: { id: true, name: true },
          })
        : []
    const vendorNameById = new Map(vendorUsers.map((u) => [u.id, u.name || "Vendor"]))

    const vendorsFormatted = vendors.map((r) => ({
      vendorId: r.vendorId,
      vendorName: r.vendorId ? vendorNameById.get(r.vendorId) || "Vendor" : "All Vendors",
      totalOrders: r.totalOrders,
      totalUnits: r.totalUnits,
      grossSales: r.grossSales,
      discountPlatform: r.discountPlatform,
      discountVendor: r.discountVendor,
      netVendorMerchandise: r.grossSales - r.discountVendor,
    }))

    return NextResponse.json({
      success: true,
      offer,
      summary: overall,
      vendors: vendorsFormatted,
      source: "stored_reports",
    })
  } catch (error: any) {
    console.error("Admin special-offer report error:", error)
    return NextResponse.json({ error: "Failed to load offer report" }, { status: 500 })
  }
}

