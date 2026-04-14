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

    // Get vendor's restaurant to verify they have one
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const where: any = {
      vendorId: user.id,
      module: "FOOD",
    }

    if (status) {
      // Handle comma-separated status values (e.g., "PENDING,CONFIRMED")
      if (status.includes(',')) {
        where.status = { in: status.split(',').map(s => s.trim()) }
      } else {
        where.status = status
      }
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search, mode: "insensitive" } } },
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
              postalCode: true,
              latitude: true,
              longitude: true,
              instructions: true,
            },
          },
          rider: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          orderTracking: {
            orderBy: { timestamp: "desc" },
            take: 1,
          },
          food: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.count({ where }),
    ])

    // Format orders for frontend
    const formattedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customer: order.customer,
      customerName: order.customer.name || order.customer.phone || "Customer",
      items: order.orderItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productType: item.productType,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        notes: item.notes,
        customizations: item.customizations,
      })),
      itemsCount: order.orderItems.length,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      serviceFee: order.serviceFee,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      address: order.address,
      rider: order.rider,
      estimatedDelivery: order.estimatedDelivery,
      actualDelivery: order.actualDelivery,
      confirmedAt: order.confirmedAt,
      preparedAt: order.preparedAt,
      pickedUpAt: order.pickedUpAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      notes: order.notes,
      specialInstructions: order.specialInstructions,
      lastTrackingStatus: order.orderTracking[0]?.status || order.status,
      restaurant: order.food,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }))

    return NextResponse.json({
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Food vendor orders fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 })
  }
}

// PATCH - Update order status
export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { orderId, status } = body

    if (!orderId || !status) {
      return NextResponse.json({ error: "orderId and status are required" }, { status: 400 })
    }

    // Verify order belongs to vendor
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        vendorId: user.id,
        module: "FOOD",
      },
    })

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Prepare update data based on status
    const updateData: any = { status }

    // Set timestamps based on status transitions
    switch (status) {
      case "CONFIRMED":
        updateData.confirmedAt = new Date()
        break
      case "PREPARING":
        updateData.preparedAt = new Date()
        break
      case "READY_FOR_PICKUP":
        // Ready for pickup - rider can collect
        break
      case "OUT_FOR_DELIVERY":
        updateData.pickedUpAt = new Date()
        break
      case "DELIVERED":
        updateData.deliveredAt = new Date()
        updateData.actualDelivery = new Date()
        break
      case "CANCELLED":
        updateData.cancelledAt = new Date()
        break
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    })

    // Create order tracking entry
    await prisma.orderTracking.create({
      data: {
        orderId: order.id,
        status: status as any,
        timestamp: new Date(),
      },
    })

    return NextResponse.json({ order: updatedOrder })
  } catch (error) {
    console.error("Order update error:", error)
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 })
  }
}



