import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const status = searchParams.get("status")

    const where: any = { storeId: store.id }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { partNumber: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
      ]
    }

    if (category) where.category = category
    if (status === "active") where.isActive = true
    if (status === "inactive") where.isActive = false
    if (status === "low-stock") where.stock = { lte: 5 }

    const [products, total] = await Promise.all([
      prisma.autoPart.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.autoPart.count({ where }),
    ])

    return NextResponse.json({
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Products fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
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

    // Validate required fields
    const requiredFields = ["name", "brand", "model", "year", "partType", "category", "condition", "price", "stock"]
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 })
      }
    }

    const product = await prisma.autoPart.create({
      data: {
        ...data,
        storeId: store.id,
        images: data.images || [],
        tags: data.tags || [],
        specifications: data.specifications || {},
      },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error("Product creation error:", error)
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 })
  }
}
