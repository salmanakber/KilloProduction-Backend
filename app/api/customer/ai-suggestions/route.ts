import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const module = (searchParams.get("module") || "").toUpperCase()
    const lat = parseFloat(searchParams.get("latitude") || "0")
    const lon = parseFloat(searchParams.get("longitude") || "0")
    const limit = Math.min(10, Math.max(1, parseInt(searchParams.get("limit") || "6")))

    if (module !== "FOOD" && module !== "GROCERY") {
      return NextResponse.json({ error: "module must be FOOD or GROCERY" }, { status: 400 })
    }

    const recentOrders = await prisma.order.findMany({
      where: { customerId: session.id, module: module as any, status: { in: ["DELIVERED", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { orderItems: true, createdAt: true },
    })

    const reorderSuggestions = await prisma.reorderSuggestion.findMany({
      where: { userId: session.id, isActive: true },
      orderBy: { frequency: "desc" },
      take: 10,
    })

    const itemFrequency = new Map<string, { name: string; count: number; productId: string; image?: string; price?: number; vendorName?: string; vendorId?: string }>()

    for (const order of recentOrders) {
      const orderItems = Array.isArray(order.orderItems) ? order.orderItems : []
      for (const item of orderItems as any[]) {
        const pid = item.productId || item.menuItemId || item.id
        if (!pid) continue
        const existing = itemFrequency.get(pid)
        if (existing) {
          existing.count++
        } else {
          itemFrequency.set(pid, {
            name: item.name || item.productName || "Unknown",
            count: 1,
            productId: pid,
            image: item.image || item.images?.[0],
            price: item.price || item.unitPrice,
            vendorName: item.restaurantName || item.storeName || item.vendorName,
            vendorId: item.restaurantId || item.storeId || item.vendorId,
          })
        }
      }
    }

    for (const rs of reorderSuggestions) {
      const existing = itemFrequency.get(rs.productId)
      if (existing) {
        existing.count += rs.frequency
      } else {
        itemFrequency.set(rs.productId, {
          name: rs.productName,
          count: rs.frequency,
          productId: rs.productId,
        })
      }
    }

    const sorted = [...itemFrequency.values()].sort((a, b) => b.count - a.count).slice(0, limit)

    if (module === "FOOD" && sorted.length > 0) {
      const productIds = sorted.map(s => s.productId)
      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: productIds }, isAvailable: true },
        select: {
          id: true, name: true, price: true, images: true,
          restaurant: { select: { id: true, name: true, logo: true, latitude: true, longitude: true } },
        },
      })
      const map = new Map(menuItems.map(mi => [mi.id, mi]))
      for (const s of sorted) {
        const mi = map.get(s.productId)
        if (mi) {
          s.name = mi.name
          s.price = mi.price
          s.image = Array.isArray(mi.images) ? (mi.images as string[])[0] : s.image
          s.vendorName = mi.restaurant?.name
          s.vendorId = mi.restaurant?.id
        }
      }
    }

    if (module === "GROCERY" && sorted.length > 0) {
      const productIds = sorted.map(s => s.productId)
      const products = await prisma.groceryProduct.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: {
          id: true, name: true, price: true, images: true, unit: true, unitSize: true,
          store: { select: { id: true, storeName: true, logo: true, latitude: true, longitude: true } },
        },
      })
      const map = new Map(products.map(p => [p.id, p]))
      for (const s of sorted) {
        const p = map.get(s.productId)
        if (p) {
          s.name = p.name
          s.price = p.price
          s.image = Array.isArray(p.images) ? (p.images as string[])[0] : s.image
          s.vendorName = p.store?.storeName
          s.vendorId = p.store?.id
        }
      }
    }

    const suggestions = sorted.filter(s => s.price != null && s.price > 0)

    return NextResponse.json({
      suggestions,
      hasHistory: recentOrders.length > 0,
    })
  } catch (e) {
    console.error("ai-suggestions GET:", e)
    return NextResponse.json({ error: "Failed to load suggestions" }, { status: 500 })
  }
}
