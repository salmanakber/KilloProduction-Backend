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
    const childId = searchParams.get("childId") // For fetching child orders
    const hasServiceRequest = searchParams.get("hasServiceRequest")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {}

    if (user.role === "CUSTOMER") {
      where.customerId = user.id
      where.isChildOrder = false
      where.NOT = { status: "DRAFT" }
    } else if (user.role === "VENDOR") {
      where.vendorId = user.id
    } else if (user.role === "RIDER") {
      where.riderId = user.id
    }

    // Support fetching child orders by parent order ID
    if (childId) {
      where.childId = childId
      where.isChildOrder = true
    }

    if (module) where.module = module
    if (user.role === "CUSTOMER" && hasServiceRequest === "true") {
      if (!module) {
        where.module = "AUTO_PARTS"
      }
      const srs = await prisma.mechanicServiceRequest.findMany({
        where: { customerId: user.id },
        select: { metadata: true },
      })
      const linkedOrderIds = new Set<string>()
      for (const sr of srs) {
        const oid = (sr.metadata as { orderId?: string } | null)?.orderId
        if (oid) linkedOrderIds.add(String(oid))
      }
      const ordersWithSrLink = await prisma.order.findMany({
        where: {
          customerId: user.id,
          isChildOrder: false,
          ...(where.module ? { module: where.module } : {}),
        },
        select: { id: true, metadata: true },
      })
      for (const o of ordersWithSrLink) {
        const m = (o.metadata as { serviceRequestId?: string } | null) || {}
        if (m.serviceRequestId) linkedOrderIds.add(o.id)
      }
      where.id = { in: linkedOrderIds.size > 0 ? Array.from(linkedOrderIds) : [] }
    }
    if (status) {
      if (status.includes(',')) {
        where.status = { in: status.split(',').map((s: string) => s.trim()) }
      } else {
        where.status = status
      }
    }

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
          food: {
            select: { id: true, name: true, logo: true },
          },
          grocery: {
            select: { id: true, storeName: true, logo: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ])

    const orderIds = orders.map((o) => o.id)
    const courierRows =
      orderIds.length > 0
        ? await prisma.courierBooking.findMany({
            where: { orderId: { in: orderIds } },
            select: {
              id: true,
              orderId: true,
              riderId: true,
              status: true,
              bookingNumber: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : []

    const courierByOrderId = new Map<string, (typeof courierRows)[0]>()
    for (const row of courierRows) {
      if (row.orderId && !courierByOrderId.has(row.orderId)) {
        courierByOrderId.set(row.orderId, row)
      }
    }

    const ordersWithDelivery = orders.map((order) => {
      const cb = courierByOrderId.get(order.id)
      return {
        ...order,
        items: order.orderItems,
        courierBookingId: cb?.id ?? null,
        courierBookingNumber: cb?.bookingNumber ?? null,
        courierBookingStatus: cb?.status ?? null,
        deliveryRiderAssigned: Boolean(cb?.riderId),
      }
    })

    return NextResponse.json({
      orders: ordersWithDelivery,
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
