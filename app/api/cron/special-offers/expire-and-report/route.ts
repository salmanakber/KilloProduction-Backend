import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { metricsForOfferLine } from "@/lib/special-offer-line-metrics"

function norm(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

export async function GET(request: NextRequest) {
  try {
    // Optional: protect cron with a shared secret
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()

    // 1) Find offers that just expired and are still active
    const expiredOffers = await prisma.specialOffer.findMany({
      where: {
        isActive: true,
        validUntil: { lt: now },
      },
      include: {
        vendors: true,
        submissions: true,
      },
    })

    if (expiredOffers.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No expired offers to process",
      })
    }

    // 2) Mark them inactive
    await prisma.specialOffer.updateMany({
      where: { id: { in: expiredOffers.map((o) => o.id) } },
      data: { isActive: false },
    })

    let reportsCreated = 0
    let notificationsSent = 0

    // 3) For each expired offer, compute basic performance per vendor based on orders
    for (const offer of expiredOffers as any[]) {
      const offerId = offer.id as string
      const module = offer.module as "PHARMACY" | "GROCERY" | "FOOD" | "AUTO_PARTS"
      const from = new Date(offer.validFrom)
      const to = new Date(offer.validUntil)

      const submissions = await prisma.specialOfferSubmission.findMany({
        where: { offerId },
      })

      // If there are no submissions, just skip stats but still notify vendors that offer ended
      for (const sub of submissions as any[]) {
        const vendorId = sub.vendorId as string
        const productId = sub.productId as string

        // Fetch orders for this vendor + module within offer period
        const orders = await prisma.order.findMany({
          where: {
            vendorId,
            module: module as any,
            status: "DELIVERED" as any,
            createdAt: { gte: from, lte: to },
          },
          include: {
            orderItems: true,
          },
        })

        let totalUnits = 0
        let totalOrders = 0
        let grossSales = 0
        let discountPlatform = 0
        let discountVendor = 0

        const offerTerms = {
          id: offer.id as string,
          discountType: offer.discountType as string | null,
          discountValue: offer.discountValue != null ? Number(offer.discountValue) : null,
          discountFundedBy: offer.discountFundedBy as string | null,
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
              quantity: Number(item.quantity || 0),
              unitPrice,
              customizations: item.customizations,
            })
            grossSales += m.grossSales
            discountPlatform += m.discountPlatform
            discountVendor += m.discountVendor
          }
          if (hasMatchedItem) {
            totalOrders += 1
          }
        }

        // Store report row (per vendor per offer)
        await prisma.specialOfferReport.create({
          data: {
            offerId,
            vendorId,
            module,
            totalOrders,
            totalUnits,
            grossSales,
            discountPlatform,
            discountVendor,
          },
        })
        reportsCreated += 1

        // Notify vendor with a short summary
        try {
          await NotificationBridge.sendNotification({
            userId: vendorId,
            title: `Offer Ended: ${offer.title}`,
            message:
              totalOrders > 0
                ? `Your submitted product made ${totalUnits} sales across ${totalOrders} orders.`
                : `The offer has ended. No sales were recorded for your submitted product.`,
            type: "SYSTEM",
            module: module as any,
            data: {
              actionType: "navigate",
              screen: "VendorSpecialOfferDetails",
              params: [{ name: "offerId", value: offerId }],
            },
            actionUrl: `/vendor/special-offers/${offerId}`,
          })
          notificationsSent += 1
        } catch (e) {
          console.error("Failed to send offer summary notification:", e)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Processed expired special offers",
      stats: {
        offersProcessed: expiredOffers.length,
        reportsCreated,
        notificationsSent,
      },
    })
  } catch (error: any) {
    console.error("Special-offers cron error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    )
  }
}

