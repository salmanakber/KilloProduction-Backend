import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const brand = searchParams.get("brand")
    const isOrganic = searchParams.get("isOrganic")
    const isFrozen = searchParams.get("isFrozen")
    const minPrice = searchParams.get("minPrice")
    const maxPrice = searchParams.get("maxPrice")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {
      isActive: true,
      stock: { gt: 0 },
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
      ]
    }

    if (category) where.category = { contains: category, mode: "insensitive" }
    if (brand) where.brand = { contains: brand, mode: "insensitive" }
    if (isOrganic === "true") where.isOrganic = true
    if (isFrozen === "true") where.isFrozen = true
    if (minPrice) where.price = { ...where.price, gte: Number.parseFloat(minPrice) }
    if (maxPrice) where.price = { ...where.price, lte: Number.parseFloat(maxPrice) }

    const [products, total] = await Promise.all([
      prisma.groceryProduct.findMany({
        where,
        include: {
          store: {
            select: {
              id: true,
              storeName: true,
              rating: true,
              isVerified: true,
              deliveryFee: true,
              minOrderAmount: true,
            },
          },
        },
        orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.groceryProduct.count({ where }),
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
    console.error("Grocery products fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch grocery products" }, { status: 500 })
  }
}
