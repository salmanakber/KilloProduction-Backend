import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Verify API key and get store
async function verifyApiKey(apiKey: string | null) {
  if (!apiKey) {
    return null
  }

  const store = await prisma.groceryStore.findFirst({
    where: { apiKey },
    include: {
      user: {
        select: {
          id: true,
          role: true,
        },
      },
    },
  })
  return store
}

// GET - Fetch orders for POS integration
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "")

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 401 })
    }

    const store = await verifyApiKey(apiKey)
    if (!store) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const status = searchParams.get("status")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const where: any = {
      vendorId: store.user.id,
      module: "GROCERY",
    }

    if (status) {
      where.status = status
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
          orderItems: {
            select: {
              id: true,
              productId: true,
              productName: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
            },
          },
          address: {
            select: {
              street: true,
              city: true,
              state: true,
              postalCode: true,
            },
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
    console.error("POS fetch orders error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
