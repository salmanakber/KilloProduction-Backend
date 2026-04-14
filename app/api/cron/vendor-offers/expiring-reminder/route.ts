import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"

/**
 * Daily (or hourly) cron: notify food & grocery vendors when a FLASH/MYSTERY offer expires within the next 36 hours.
 * Protect with CRON_SECRET Authorization: Bearer <secret>.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    const horizon = new Date(now.getTime() + 36 * 60 * 60 * 1000)

    const [foodOffers, groceryOffers] = await Promise.all([
      prisma.restaurantOffer.findMany({
        where: {
          isActive: true,
          promoKind: { in: ["FLASH", "MYSTERY"] },
          expiresAt: { gte: now, lte: horizon },
        },
        include: {
          restaurant: { select: { userId: true, name: true } },
        },
      }),
      prisma.groceryOffer.findMany({
        where: {
          isActive: true,
          promoKind: { in: ["FLASH", "MYSTERY"] },
          expiresAt: { gte: now, lte: horizon },
        },
        include: {
          store: { select: { userId: true, storeName: true } },
        },
      }),
    ])

    let notificationsSent = 0

    for (const o of foodOffers) {
      const uid = o.restaurant?.userId
      if (!uid) continue
      try {
        await NotificationBridge.sendNotification({
          userId: uid,
          title: `Offer ending soon: ${o.title}`,
          message: `Your ${String(o.promoKind || "promo").toLowerCase()} deal expires ${o.expiresAt.toISOString().slice(0, 16)} UTC. Renew or update in your offers screen.`,
          type: "SYSTEM",
          module: "FOOD",
          data: {
            actionType: "navigate",
            screen: "RestaurantOffers",
            offerId: o.id,
          },
        })
        notificationsSent += 1
      } catch (e) {
        console.error("food offer reminder notify:", e)
      }
    }

    for (const o of groceryOffers) {
      const uid = o.store?.userId
      if (!uid) continue
      try {
        await NotificationBridge.sendNotification({
          userId: uid,
          title: `Offer ending soon: ${o.title}`,
          message: `Your ${String(o.promoKind || "promo").toLowerCase()} deal expires ${o.expiresAt.toISOString().slice(0, 16)} UTC. Renew or update in grocery offers.`,
          type: "SYSTEM",
          module: "GROCERY",
          data: {
            actionType: "navigate",
            screen: "GroceryOffers",
            offerId: o.id,
          },
        })
        notificationsSent += 1
      } catch (e) {
        console.error("grocery offer reminder notify:", e)
      }
    }

    return NextResponse.json({
      success: true,
      foodOffersChecked: foodOffers.length,
      groceryOffersChecked: groceryOffers.length,
      notificationsSent,
    })
  } catch (error: any) {
    console.error("vendor-offers expiring-reminder cron:", error)
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 },
    )
  }
}
