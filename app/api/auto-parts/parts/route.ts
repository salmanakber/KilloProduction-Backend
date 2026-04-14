import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const brand = searchParams.get("brand")
    const model = searchParams.get("model")
    const year = searchParams.get("year")
    const category = searchParams.get("category")
    const condition = searchParams.get("condition")
    const minPrice = searchParams.get("minPrice")
    const maxPrice = searchParams.get("maxPrice")
    const city = searchParams.get("city") // City filter
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {
      isActive: true,
      stock: { gt: 0 },
    }

    // Filter by vendor city if provided
    if (city) {
      where.store = {
        user: {
          vendorProfile: {
            city: {
              contains: city,
              mode: "insensitive",
            },
          },
        },
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { partNumber: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
      ]
    }

    if (brand) where.brand = { contains: brand, mode: "insensitive" }
    if (model) where.model = { contains: model, mode: "insensitive" }
    if (year) where.year = year
    if (category) where.category = category
    if (condition) where.condition = condition
    if (minPrice) where.price = { ...where.price, gte: Number.parseFloat(minPrice) }
    if (maxPrice) where.price = { ...where.price, lte: Number.parseFloat(maxPrice) }

    const [parts, total] = await Promise.all([
      prisma.autoPart.findMany({
        where,
        include: {
          store: {
            select: {
              storeName: true,
              rating: true,
              isVerified: true,
              deliveryZones: true,
            },
          },
        },
        orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.autoPart.count({ where }),
    ])

    return NextResponse.json({
      parts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Auto parts fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch auto parts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.autoPartsStore.findUnique({
      where: { userId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Auto parts store not found" }, { status: 404 })
    }

    const data = await request.json()

    const part = await prisma.autoPart.create({
      data: {
        ...data,
        storeId: store.id,
      },
      include: {
        store: {
          select: {
            storeName: true,
            rating: true,
            isVerified: true,
          },
        },
      },
    })

    return NextResponse.json(part, { status: 201 })
  } catch (error) {
    console.error("Auto part creation error:", error)
    return NextResponse.json({ error: "Failed to create auto part" }, { status: 500 })
  }
}
