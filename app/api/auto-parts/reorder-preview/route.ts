import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const city = searchParams.get("city")?.trim()
    const userLat = searchParams.get("latitude") ? parseFloat(searchParams.get("latitude")!) : null
    const userLng = searchParams.get("longitude") ? parseFloat(searchParams.get("longitude")!) : null
    const maxKm = parseFloat(searchParams.get("maxKm") || "70")

    const lastOrder = await prisma.order.findFirst({
      where: {
        customerId: user.id,
        module: "AUTO_PARTS",
        paymentStatus: "PAID",
      },
      orderBy: { createdAt: "desc" },
      include: { orderItems: true },
    })

    if (!lastOrder?.orderItems?.length) {
      return NextResponse.json({ lastOrderId: null, items: [] })
    }

    const items: Array<{
      productId: string
      name: string
      quantity: number
      unitPrice: number
      available: boolean
      vendorId?: string
      storeName?: string
      storeCity?: string
      distance?: string
      distanceValue?: number
    }> = []

    for (const oi of lastOrder.orderItems) {
      if (oi.productType !== "AUTO_PART") continue
      const where: any = {
        id: oi.productId,
        type: "AUTO_PART",
        isActive: true,
        stockQuantity: { gt: 0 },
      }
      if (city) {
        where.vendor = {
          vendorProfile: { is: { city: { contains: city, mode: "insensitive" } } },
        }
      }
      const live = await prisma.product.findFirst({
        where,
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              vendorProfile: { select: { businessName: true, city: true, latitude: true, longitude: true } },
            },
          },
        },
      })
      if (live) {
        const vendorLat = live.vendor.vendorProfile?.latitude
        const vendorLng = live.vendor.vendorProfile?.longitude
        const distanceValue =
          userLat != null && userLng != null && vendorLat != null && vendorLng != null
            ? calculateDistance(userLat, userLng, vendorLat, vendorLng)
            : undefined
        if (distanceValue != null && Number.isFinite(distanceValue) && distanceValue > maxKm) {
          continue
        }
        items.push({
          productId: live.id,
          name: live.name,
          quantity: oi.quantity,
          unitPrice: live.price,
          available: true,
          vendorId: live.vendorId,
          storeName: live.vendor.vendorProfile?.businessName || live.vendor.name,
          storeCity: live.vendor.vendorProfile?.city || undefined,
          distanceValue,
          distance: distanceValue != null ? `${distanceValue.toFixed(1)} km` : undefined,
        })
      } else {
        items.push({
          productId: oi.productId,
          name: oi.productName,
          quantity: oi.quantity,
          unitPrice: oi.unitPrice,
          available: false,
        })
      }
    }

    return NextResponse.json({ lastOrderId: lastOrder.id, items })
  } catch (e: any) {
    console.error("auto-parts reorder-preview:", e)
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
