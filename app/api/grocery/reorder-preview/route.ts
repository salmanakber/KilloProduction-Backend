import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getNearbyGroceryCatalog, matchGroceryLineToProduct } from "@/lib/smart-shopping/nearby-catalog"

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
        module: "GROCERY",
        paymentStatus: "PAID",
      },
      orderBy: { createdAt: "desc" },
      include: {
        orderItems: true,
        grocery: { select: { id: true, storeName: true } },
      },
    })

    if (!lastOrder?.orderItems?.length) {
      return NextResponse.json({
        lastOrderId: null,
        items: [],
        essentialsSuggestion: [],
        storeId: null,
        storeName: null,
      })
    }

    const catalog = await getNearbyGroceryCatalog(parseFloat(lat), parseFloat(lng), maxKm, 400)
    const lines: Array<{
      productId: string
      name: string
      quantity: number
      storeId: string
      storeName: string
      unitPrice: number
      unit: string
      available: boolean
    }> = []

    for (const oi of lastOrder.orderItems) {
      if (oi.productType !== "GROCERY_PRODUCT") continue
      const live = await prisma.groceryProduct.findFirst({
        where: { id: oi.productId, isActive: true, stock: { gt: 0 } },
        include: { store: { select: { id: true, storeName: true } } },
      })
      if (live) {
        lines.push({
          productId: live.id,
          name: live.name,
          quantity: oi.quantity,
          storeId: live.storeId,
          storeName: live.store.storeName,
          unitPrice: live.price,
          unit: live.unit,
          available: true,
        })
      } else {
        const fallback = matchGroceryLineToProduct(oi.productName, catalog)
        if (fallback) {
          lines.push({
            productId: fallback.id,
            name: fallback.name,
            quantity: oi.quantity,
            storeId: fallback.storeId,
            storeName: fallback.storeName,
            unitPrice: fallback.price,
            unit: fallback.unit,
            available: true,
          })
        } else {
          lines.push({
            productId: oi.productId,
            name: oi.productName,
            quantity: oi.quantity,
            storeId: lastOrder.groceryId || "",
            storeName: lastOrder.grocery?.storeName || "",
            unitPrice: oi.unitPrice,
            unit: "",
            available: false,
          })
        }
      }
    }

    // Essentials: frequent names from last 5 orders not in this reorder list
    const recent = await prisma.order.findMany({
      where: { customerId: user.id, module: "GROCERY", paymentStatus: "PAID" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { orderItems: true },
    })
    const freq = new Map<string, number>()
    const inList = new Set(lines.filter((l) => l.available).map((l) => l.name.toLowerCase()))
    for (const o of recent) {
      for (const oi of o.orderItems) {
        if (oi.productType !== "GROCERY_PRODUCT") continue
        const k = oi.productName.toLowerCase()
        freq.set(k, (freq.get(k) || 0) + oi.quantity)
      }
    }
    const essentialsSuggestion: Array<{ productId: string; name: string; storeId: string; storeName: string; unitPrice: number; unit: string }> = []
    for (const [name, _] of [...freq.entries()].sort((a, b) => b[1] - a[1])) {
      if (inList.has(name)) continue
      const m = matchGroceryLineToProduct(name, catalog)
      if (m) {
        essentialsSuggestion.push({
          productId: m.id,
          name: m.name,
          storeId: m.storeId,
          storeName: m.storeName,
          unitPrice: m.price,
          unit: m.unit,
        })
      }
      if (essentialsSuggestion.length >= 5) break
    }

    return NextResponse.json({
      lastOrderId: lastOrder.id,
      storeId: lastOrder.groceryId,
      storeName: lastOrder.grocery?.storeName,
      items: lines,
      essentialsSuggestion,
    })
  } catch (e: any) {
    console.error("grocery reorder-preview:", e)
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
