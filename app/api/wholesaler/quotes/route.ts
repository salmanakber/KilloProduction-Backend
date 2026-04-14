import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Get wholesaler
    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    // Build where clause for quotes
    const where: any = {
      wholesalerId: wholesaler.id,
      isQuote: true,
    }

    if (status && status !== "ALL") {
      if (status.includes(',')) {
        where.status = { in: status.split(',').map(s => s.trim()) }
      } else {
        where.status = status
      }
    }

    const [quotes, total] = await Promise.all([
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
          items: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supplierOrder.count({ where }),
    ])

    return NextResponse.json({
      quotes: quotes.map(quote => ({
        id: quote.id,
        orderNumber: quote.orderNumber,
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        totalAmount: quote.totalAmount,
        currency: quote.currency,
        deliveryAddress: quote.deliveryAddress,
        notes: quote.notes,
        expectedDeliveryDate: quote.expectedDeliveryDate,
        quoteExpiryDate: quote.quoteExpiryDate,
        supplierResponse: quote.supplierResponse,
        createdAt: quote.createdAt,
        pharmacy: quote.pharmacy,
        items: quote.items.map(item => ({
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
    console.error("Wholesaler quotes fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch quotes" }, { status: 500 })
  }
}