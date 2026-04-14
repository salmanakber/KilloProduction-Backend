import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const cuisine = searchParams.get("cuisine")
    const priceRange = searchParams.get("priceRange")
    const isOpen = searchParams.get("isOpen")
    const deliveryZone = searchParams.get("deliveryZone")
    const minRating = searchParams.get("minRating")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {
      isVerified: true,
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { cuisine: { hasSome: [search] } },
      ]
    }

    if (cuisine) {
      where.cuisine = { has: cuisine }
    }

    if (priceRange) {
      where.priceRange = priceRange
    }

    if (isOpen === "true") {
      where.isOpen = true
    }

    if (deliveryZone) {
      where.deliveryZones = { has: deliveryZone }
    }

    if (minRating) {
      where.rating = { gte: Number.parseFloat(minRating) }
    }

    const [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              phone: true,
              isVerified: true,
            },
          },
          menuItems: {
            where: { isAvailable: true },
            select: {
              id: true,
              name: true,
              price: true,
              images: true,
              isFeatured: true,
              isPopular: true,
            },
            take: 5,
          },
          _count: {
            select: {
              menuItems: {
                where: { isAvailable: true },
              },
            },
          },
        },
        orderBy: [{ isVerified: "desc" }, { rating: "desc" }, { totalOrders: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.restaurant.count({ where }),
    ])

    return NextResponse.json({
      restaurants,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Restaurants fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch restaurants" }, { status: 500 })
  }
}
