import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {
      riderId: session.user.id,
    }

    if (status) {
      where.status = status
    }

    const [deliveries, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: {
            select: { name: true, phone: true },
          },
          vendor: {
            select: { businessName: true, address: true, phone: true },
          },
          items: {
            select: {
              productName: true,
              quantity: true,
              unitPrice: true,
            },
          },
          deliveryAddress: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ])

    return NextResponse.json({
      deliveries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching deliveries:", error)
    return NextResponse.json({ error: "Failed to fetch deliveries" }, { status: 500 })
  }
}
