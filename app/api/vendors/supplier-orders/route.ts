import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { isValidLatLon } from "@/lib/geo"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Build where clause
    const where: any = {
      pharmacy: { userId: user.id }
    }

    if (status && status !== "ALL") {
      // Handle comma-separated status values
      if (status.includes(',')) {
        where.status = { in: status.split(',').map(s => s.trim()) }
      } else {
        where.status = status
      }
    }

    // Get supplier orders
    const [orders, total] = await Promise.all([
      prisma.supplierOrder.findMany({
        where,
        include: {
          wholesaler: {
            select: {
              id: true,
              companyName: true,
              phone: true,
              email: true,
            },
          },
          items: true,
          courierBooking: {
            include: {
              rider: {
                select: {
                  id: true, // keep id for reference
                  name: true,
                  phone: true,
                  email: true,
                  riderProfile: true, // ✅ include relation directly inside select
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      
      prisma.supplierOrder.count({ where }),
    ]);
    
    
    

    return NextResponse.json({
      orders: orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        currency: order.currency,
        deliveryAddress: order.deliveryAddress,
        notes: order.notes,
        expectedDeliveryDate: order.expectedDeliveryDate,
        createdAt: order.createdAt,
        wholesaler: order.wholesaler,
        supplierResponse: order.supplierResponse,
        orderSlip: (order as { orderSlip?: unknown }).orderSlip ?? null,
        courierBooking: order.courierBooking ? {
          id: order.courierBooking.id,
          status: order.courierBooking.status,
          riderId: order.courierBooking.riderId,
          riderProfile: order.courierBooking?.rider?.riderProfile,
          rider: order.courierBooking.rider,
        } : null,
        items: order.items.map(item => ({
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
    console.error("Supplier orders fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch supplier orders" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { 
      wholesalerId, 
      items, 
      deliveryAddress, 
      deliveryLatitude,
      deliveryLongitude,
      notes, 
      expectedDeliveryDate,
      currency,
      orderType = "QUOTE" // QUOTE or CONFIRMED_ORDER
    } = body

    // Validate required fields
    if (!wholesalerId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Wholesaler ID and items are required" },
        { status: 400 }
      )
    }

    // Get pharmacy details
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json(
        { error: "Pharmacy profile not found" },
        { status: 404 }
      )
    }

    // Verify wholesaler exists and is verified
    const wholesaler = await prisma.wholesaler.findUnique({
      where: { id: wholesalerId, isVerified: true },
      include: {
        wholesalerProducts: {
          where: { isActive: true },
        },
      },
    })

    if (!wholesaler) {
      return NextResponse.json(
        { error: "Wholesaler not found or not verified" },
        { status: 404 }
      )
    }

    const resolvedAddress = (typeof deliveryAddress === "string" && deliveryAddress.trim())
      ? deliveryAddress.trim()
      : pharmacy.address

    const latRaw =
      deliveryLatitude != null ? Number(deliveryLatitude) : pharmacy.lat != null ? Number(pharmacy.lat) : NaN
    const lonRaw =
      deliveryLongitude != null ? Number(deliveryLongitude) : pharmacy.lon != null ? Number(pharmacy.lon) : NaN

    if (!isValidLatLon(latRaw, lonRaw)) {
      return NextResponse.json(
        {
          error:
            "Delivery location is missing valid coordinates. Open pharmacy profile, set the address using the map picker so latitude and longitude are saved, then try again.",
        },
        { status: 400 }
      )
    }

    // Validate items and calculate totals
    let totalAmount = 0
    const validatedItems: any[] = []

    for (const item of items) {
      const product = wholesaler.wholesalerProducts.find(p => p.id === item.productId)
      if (!product) {
        return NextResponse.json(
          { error: `Product ${item.productId} not found or not available` },
          { status: 400 }
        )
      }

      // For quotes, don't check stock availability
      if (orderType === "CONFIRMED_ORDER" && product.stock < item.quantity) {
        return NextResponse.json(
          { error: `Insufficient stock for product ${product.name}` },
          { status: 400 }
        )
      }

      const itemTotal = product.unitPrice * item.quantity
      totalAmount += itemTotal

      validatedItems.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.unitPrice,
        totalPrice: itemTotal,
      })
    }

    // Generate order/quote number
    const orderNumber = `SO-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
    const quoteNumber = orderType === "QUOTE" ? `Q-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}` : null

    // Create supplier order
    const supplierOrder = await prisma.supplierOrder.create({
      data: {
        orderNumber,
        quoteNumber,
        pharmacyId: pharmacy.id,
        wholesalerId,
        status: orderType === "QUOTE" ? "QUOTE_SENT" : "PENDING",
        orderType: orderType as any,
        totalAmount,
        currency: currency || "NGN", // Default currency
        deliveryAddress: resolvedAddress,
        deliveryLatitude: latRaw,
        deliveryLongitude: lonRaw,
        notes,
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
        isQuote: orderType === "QUOTE",
        quoteExpiryDate: orderType === "QUOTE" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null, // 7 days
        items: {
          create: validatedItems,
        },
      },
      include: {
        wholesaler: {
          select: {
            id: true,
            companyName: true,
            phone: true,
            email: true,
          },
        },
        items: true,
      },
    })

    // Send notification to supplier
    if (orderType === "QUOTE") {
      const { NotificationBridge } = await import("@/lib/notification-bridge")
      await NotificationBridge.notifySupplierQuote(
        wholesalerId,
        supplierOrder.id,
        pharmacy.pharmacyName
      )
    }

    return NextResponse.json({
      message: orderType === "QUOTE" ? "Quote sent successfully" : "Supplier order created successfully",
      order: {
        id: supplierOrder.id,
        orderNumber: supplierOrder.orderNumber,
        quoteNumber: supplierOrder.quoteNumber,
        status: supplierOrder.status,
        orderType: supplierOrder.orderType,
        totalAmount: supplierOrder.totalAmount,
        currency: supplierOrder.currency,
        deliveryAddress: supplierOrder.deliveryAddress,
        notes: supplierOrder.notes,
        expectedDeliveryDate: supplierOrder.expectedDeliveryDate,
        isQuote: supplierOrder.isQuote,
        quoteExpiryDate: supplierOrder.quoteExpiryDate,
        createdAt: supplierOrder.createdAt,
        wholesaler: supplierOrder.wholesaler,
        items: supplierOrder.items.map(item => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
      },
    })
  } catch (error) {
    console.error("Supplier order creation error:", error)
    return NextResponse.json(
      { error: "Failed to create supplier order" },
      { status: 500 }
    )
  }
}
