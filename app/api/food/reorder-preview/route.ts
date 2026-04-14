import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getNearbyFoodCatalog, matchFoodLineToItem } from "@/lib/smart-shopping/nearby-catalog"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("latitude")
    const lng = searchParams.get("longitude")
    const maxKm = parseFloat(searchParams.get("maxKm") || "25")

    if (!lat || !lng) {
      return NextResponse.json({ error: "latitude and longitude required" }, { status: 400 })
    }

    const lastOrder = await prisma.order.findFirst({
      where: {
        customerId: user.id,
        module: "FOOD",
        paymentStatus: "PAID",
      },
      orderBy: { createdAt: "desc" },
      include: {
        orderItems: true,
        food: { select: { id: true, name: true } },
      },
    })

    if (!lastOrder?.orderItems?.length) {
      return NextResponse.json({
        lastOrderId: null,
        items: [],
        essentialsSuggestion: [],
        restaurantId: null,
        restaurantName: null,
      })
    }

    const catalog = await getNearbyFoodCatalog(parseFloat(lat), parseFloat(lng), maxKm, 400)
    const lines: Array<{
      menuItemId: string
      name: string
      quantity: number
      restaurantId: string
      restaurantName: string
      unitPrice: number
      available: boolean
    }> = []

    for (const oi of lastOrder.orderItems) {
      if (oi.productType !== "MENU_ITEM") continue
      const live = await prisma.menuItem.findFirst({
        where: { id: oi.productId, isAvailable: true },
        include: { restaurant: { select: { id: true, name: true } } },
      })
      if (live) {
        lines.push({
          menuItemId: live.id,
          name: live.name,
          quantity: oi.quantity,
          restaurantId: live.restaurantId,
          restaurantName: live.restaurant.name,
          unitPrice: live.price,
          available: true,
        })
      } else {
        const fallback = matchFoodLineToItem(oi.productName, catalog)
        if (fallback) {
          lines.push({
            menuItemId: fallback.id,
            name: fallback.name,
            quantity: oi.quantity,
            restaurantId: fallback.restaurantId,
            restaurantName: fallback.restaurantName,
            unitPrice: fallback.price,
            available: true,
          })
        } else {
          lines.push({
            menuItemId: oi.productId,
            name: oi.productName,
            quantity: oi.quantity,
            restaurantId: lastOrder.foodId || "",
            restaurantName: lastOrder.food?.name || "",
            unitPrice: oi.unitPrice,
            available: false,
          })
        }
      }
    }

    const recent = await prisma.order.findMany({
      where: { customerId: user.id, module: "FOOD", paymentStatus: "PAID" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { orderItems: true },
    })
    const freq = new Map<string, number>()
    const inList = new Set(lines.filter((l) => l.available).map((l) => l.name.toLowerCase()))
    for (const o of recent) {
      for (const oi of o.orderItems) {
        if (oi.productType !== "MENU_ITEM") continue
        const k = oi.productName.toLowerCase()
        freq.set(k, (freq.get(k) || 0) + oi.quantity)
      }
    }

    const essentialsSuggestion: Array<{
      menuItemId: string
      name: string
      restaurantId: string
      restaurantName: string
      unitPrice: number
    }> = []

    for (const [name, _] of [...freq.entries()].sort((a, b) => b[1] - a[1])) {
      if (inList.has(name)) continue
      const m = matchFoodLineToItem(name, catalog)
      if (m) {
        essentialsSuggestion.push({
          menuItemId: m.id,
          name: m.name,
          restaurantId: m.restaurantId,
          restaurantName: m.restaurantName,
          unitPrice: m.price,
        })
      }
      if (essentialsSuggestion.length >= 5) break
    }

    return NextResponse.json({
      lastOrderId: lastOrder.id,
      restaurantId: lastOrder.foodId,
      restaurantName: lastOrder.food?.name,
      items: lines,
      essentialsSuggestion,
    })
  } catch (e: any) {
    console.error("food reorder-preview:", e)
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
