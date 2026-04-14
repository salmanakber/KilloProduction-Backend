import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const module = searchParams.get("module")
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {}

    if (user.role === "CUSTOMER") {
      where.customerId = user.id
    } else if (user.role === "VENDOR") {
      where.vendorId = user.id
    } else if (user.role === "RIDER") {
      where.riderId = user.id
    }

    if (module) where.module = module
    if (status) where.status = status

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: {
            select: {
              name: true,
              phone: true,
              userProfile: true,
            },
          },
          vendor: {
            select: {
              name: true,
              phone: true,
            },
          },
          rider: {
            select: {
              name: true,
              phone: true,
            },
          },
          address: true,
          orderItems: true,
          orderTracking: {
            orderBy: { timestamp: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ])

    return NextResponse.json({
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Orders fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const { items, addressId, paymentMethodId, module, vendorId, notes } = data

    // Calculate totals
    let subtotal = 0
    for (const item of items) {
      subtotal += item.quantity * item.price
    }

    const deliveryFee = data.deliveryFee || 0
    const serviceFee = data.serviceFee || 0
    const tax = subtotal * 0.1 // 10% tax
    const total = subtotal + deliveryFee + serviceFee + tax

    // Generate order number
    const orderNumber = `KS${Date.now()}${Math.floor(Math.random() * 1000)}`

    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerId: user.id,
        vendorId,
        addressId,
        paymentMethodId,
        module,
        subtotal,
        deliveryFee,
        serviceFee,
        tax,
        total,
        notes,
        orderItems: {
          create: items.map((item: any) => ({
            productId: item.productId,
            productType: item.productType,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.quantity * item.price,
            notes: item.notes,
            customizations: item.customizations,
          })),
        },
        orderTracking: {
          create: {
            status: "PENDING",
            notes: "Order placed successfully",
          },
        },
      },
      include: {
        orderItems: true,
        orderTracking: true,
        address: true,
      },
    })

    // TODO: Send notification to vendor
    // TODO: Process payment

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    console.error("Order creation error:", error)
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
  }
}
