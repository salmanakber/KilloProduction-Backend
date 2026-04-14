import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")

    const where: any = { pharmacyId: pharmacy.id }
    if (status) where.status = status

    const orders = await prisma.supplierOrder.findMany({
      where,
      include: {
        wholesaler: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ orders })
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

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const { wholesalerId, items, notes } = await request.json()

    if (!wholesalerId || !items || items.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Calculate total amount
    const totalAmount = items.reduce((sum: number, item: any) => sum + item.quantity * item.unitPrice, 0)

    // Generate order number
    const orderNumber = `SO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const supplierOrder = await prisma.supplierOrder.create({
      data: {
        pharmacyId: pharmacy.id,
        wholesalerId,
        orderNumber,
        totalAmount,
        notes,
        items: {
          create: items.map((item: any) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        wholesaler: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
        items: true,
      },
    })

    // Send notification to wholesaler
    await prisma.notification.create({
      data: {
        userId: wholesalerId,
        title: "New Supplier Order",
        message: `You received a new order from ${pharmacy.pharmacyName}`,
        type: "ORDER_UPDATE",
        module: "PHARMACY",
        data: {
          orderId: supplierOrder.id,
          pharmacyName: pharmacy.pharmacyName,
        },
      },
    })

    return NextResponse.json(supplierOrder, { status: 201 })
  } catch (error) {
    console.error("Supplier order creation error:", error)
    return NextResponse.json({ error: "Failed to create supplier order" }, { status: 500 })
  }
}
