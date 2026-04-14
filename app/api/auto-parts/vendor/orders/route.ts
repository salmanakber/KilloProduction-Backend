import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const skip = (page - 1) * limit
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    const where: any = {
      vendorId: user.id,
      module: "AUTO_PARTS",
    }

    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
      ]
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
              avatar: true,
            },
          },
          orderItems: {
            select: {
              id: true,
              productId: true,
              productType: true,
              productName: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              notes: true,
              customizations: true,
            },
          },
          address: {
            select: {
              id: true,
              title: true,
              street: true,
              city: true,
              state: true,
              country: true,
              postalCode: true,
              latitude: true,
              longitude: true,
              instructions: true,
            },
          },
          orderTracking: {
            orderBy: { timestamp: "desc" },
            take: 1,
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.count({ where }),
    ])

    return NextResponse.json({
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        serviceFee: order.serviceFee,
        tax: order.tax,
        discount: order.discount,
        total: order.total,
        deliveryType: order.deliveryType,
        estimatedDelivery: order.estimatedDelivery,
        actualDelivery: order.actualDelivery,
        trackingNumber: order.trackingNumber,
        notes: order.notes,
        specialInstructions: order.specialInstructions,
        confirmedAt: order.confirmedAt,
        preparedAt: order.preparedAt,
        pickedUpAt: order.pickedUpAt,
        deliveredAt: order.deliveredAt,
        cancelledAt: order.cancelledAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customer: order.customer,
        address: order.address,
        items: order.orderItems,
        latestTracking: order.orderTracking[0] || null,
        metadata: (order as any).metadata || {}, // Include metadata with handoverCode, mechanicName, etc.
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Orders fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const { orderId, status } = data

    if (!orderId || !status) {
      return NextResponse.json({ error: "orderId and status are required" }, { status: 400 })
    }

    // Verify order belongs to vendor
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        vendorId: user.id,
        module: "AUTO_PARTS",
      },
    })

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(status === "CONFIRMED" && { confirmedAt: new Date() }),
        ...(status === "PREPARING" && { preparedAt: new Date() }),
        ...(status === "OUT_FOR_DELIVERY" && { shippedAt: new Date() }),
        ...(status === "DELIVERED" && { deliveredAt: new Date() }),
        ...(status === "CANCELLED" && { cancelledAt: new Date() }),
      },
    })

    // Create order tracking entry
    await prisma.orderTracking.create({
      data: {
        orderId: order.id,
        status: status as any,
        notes: `Order status updated by vendor to ${status}`,
        timestamp: new Date(),
      },
    })

    return NextResponse.json({ order: updatedOrder })
  } catch (error) {
    console.error("Order update error:", error)
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 })
  }
}

