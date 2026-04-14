import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })
    

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Build where clause for orders (not quotes)
    const where: any = {
      wholesalerId: wholesaler.id,
      isQuote: false, // Only actual orders, not quotes
    }

    if (status && status !== "ALL") {
      if (status.includes(',')) {
        where.status = { in: status.split(',').map(s => s.trim()) }
      } else {
        where.status = status
      }
    }
    
    const [orders, total] = await Promise.all([
      prisma.supplierOrder.findMany({
        where,
        include: {
          pharmacy: {
            select: {
              id: true,
              pharmacyName: true,
              phone: true,
              address: true,
              user: {
                select: {
                  name: true,
                  email: true,
                }
              }
            }
          },
          courierBooking: true,
          items: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supplierOrder.count({ where }),
    ])

    return NextResponse.json({
      orders: orders.map((order: any) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        currency: order.currency,
        deliveryAddress: order.deliveryAddress,
        notes: order.notes,
        expectedDeliveryDate: order.expectedDeliveryDate,
        createdAt: order.createdAt,
        pharmacy: order.pharmacy,
        courierBooking: order.courierBooking,
        items: order.items.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Wholesaler orders fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 })
  }
}
