import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const city = searchParams.get("city")
    const isVerified = searchParams.get("isVerified")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {
      isActive: true,
    }

    if (search) {
      where.OR = [
        { storeName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ]
    }

    if (city) {
      where.deliveryZones = {
        has: city,
      }
    }

    if (isVerified === "true") {
      where.isVerified = true
    }

    const [stores, total] = await Promise.all([
      prisma.autoPartsStore.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              phone: true,
              isVerified: true,
            },
          },
          autoParts: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              price: true,
              images: true,
              isFeatured: true,
            },
            take: 5,
          },
          _count: {
            select: {
              autoParts: {
                where: { isActive: true },
              },
            },
          },
        },
        orderBy: [{ isVerified: "desc" }, { rating: "desc" }, { totalOrders: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.autoPartsStore.count({ where }),
    ])

    return NextResponse.json({
      stores,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Auto parts stores fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch auto parts stores" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user already has an auto parts store
    const existingStore = await prisma.autoPartsStore.findUnique({
      where: { userId: user.id },
    })

    if (existingStore) {
      return NextResponse.json({ error: "User already has an auto parts store" }, { status: 400 })
    }

    const data = await request.json()

    const store = await prisma.autoPartsStore.create({
      data: {
        ...data,
        userId: user.id,
      },
      include: {
        user: {
          select: {
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json(store, { status: 201 })
  } catch (error) {
    console.error("Auto parts store creation error:", error)
    return NextResponse.json({ error: "Failed to create auto parts store" }, { status: 500 })
  }
}
