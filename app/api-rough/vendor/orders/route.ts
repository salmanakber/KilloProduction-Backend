import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const vendorId = decoded.userId

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = { vendorId }

    if (status && status !== "all") {
      where.status = status.toUpperCase()
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  images: true,
                  price: true,
                },
              },
            },
          },
          delivery: {
            select: {
              address: true,
              estimatedDeliveryTime: true,
              deliveryType: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ])

    // Format orders for frontend
    const formattedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customer: {
        name: order.customer.name,
        phone: order.customer.phone,
        email: order.customer.email,
        address: order.delivery?.address || "N/A",
      },
      items: order.items.map((item) => ({
        id: item.product.id,
        name: item.product.name,
        quantity: item.quantity,
        price: item.price,
        image: item.product.images?.[0],
      })),
      status: order.status.toLowerCase(),
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      estimatedDeliveryTime: order.delivery?.estimatedDeliveryTime,
      paymentStatus: order.paymentStatus.toLowerCase(),
      deliveryType: order.delivery?.deliveryType?.toLowerCase() || "delivery",
      specialInstructions: order.specialInstructions,
    }))

    return NextResponse.json({
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching orders:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
