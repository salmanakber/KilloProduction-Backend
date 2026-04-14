import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const city = searchParams.get("city")?.trim()

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
              vendorProfile: { select: { businessName: true, city: true } },
            },
          },
        },
      })
      if (live) {
        items.push({
          productId: live.id,
          name: live.name,
          quantity: oi.quantity,
          unitPrice: live.price,
          available: true,
          vendorId: live.vendorId,
          storeName: live.vendor.vendorProfile?.businessName || live.vendor.name,
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
