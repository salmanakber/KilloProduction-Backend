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
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {}

    if (user.role === "CUSTOMER") {
      where.userId = user.id
    } else if (user.role === "VENDOR") {
      // Vendors can see all open requests
      where.status = "OPEN"
    }

    if (status) {
      where.status = status
    }

    const [requests, total] = await Promise.all([
      prisma.partRequest.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
          offers: {
            include: {
              vendor: {
                select: {
                  name: true,
                  autoPartsStore: {
                    select: {
                      storeName: true,
                      rating: true,
                      isVerified: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: {
              offers: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.partRequest.count({ where }),
    ])

    return NextResponse.json({
      requests,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Part requests fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch part requests" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Set expiry date (default 7 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const partRequest = await prisma.partRequest.create({
      data: {
        ...data,
        userId: user.id,
        expiresAt,
      },
      include: {
        user: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    })

    // Notify relevant vendors
    const vendors = await prisma.user.findMany({
      where: {
        role: "VENDOR",
        autoPartsStore: {
          isNot: null,
          isActive: true,
        },
      },
      include: {
        autoPartsStore: true,
      },
    })

    // Send notifications to vendors (implement push notification logic)
    for (const vendor of vendors) {
      // TODO: Send push notification to vendor
      console.log(`Notifying vendor ${vendor.name} about new part request`)
    }

    return NextResponse.json(partRequest, { status: 201 })
  } catch (error) {
    console.error("Part request creation error:", error)
    return NextResponse.json({ error: "Failed to create part request" }, { status: 500 })
  }
}
