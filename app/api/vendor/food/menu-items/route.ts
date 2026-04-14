import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { validateFoodMenuItemPublish } from "@/lib/menuItemPublish"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const categoryId = searchParams.get("categoryId")
    const status = searchParams.get("status")
    const search = searchParams.get("search")

   

    const where: any = {
      restaurantId: restaurant.id,
    }

    if (categoryId) {
      where.categoryId = categoryId
    }

    if (status === "available") {
      where.isAvailable = true
    } else if (status === "unavailable") {
      where.isAvailable = false
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ]
    }

    const [menuItems, total] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.menuItem.count({ where }),
    ])

    return NextResponse.json({
      menuItems,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching menu items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const body = await request.json()
    const {
      name,
      description,
      price,
      compareAtPrice,
      categoryId,
      preparationTime,
      calories,
      ingredients,
      allergens,
      spiceLevel,
      images,
      variants,
      addOns,
      isVegetarian,
      isVegan,
      isGlutenFree,
      isAvailable,
      isFeatured,
      isPopular,
      tags,
    } = body

    // Validate required fields
    if (!name || !price) {
      return NextResponse.json({ error: "Name and price are required" }, { status: 400 })
    }

    const publishErr = await validateFoodMenuItemPublish(
      restaurant.id,
      categoryId,
      isAvailable !== undefined ? isAvailable : true
    )
    if (publishErr) {
      return NextResponse.json({ error: publishErr }, { status: 400 })
    }

    const menuItem = await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categoryId || null,
        name,
        description,
        price,
        compareAtPrice: Number(compareAtPrice),
        preparationTime: preparationTime || 15,
        calories,
        ingredients: ingredients || null,
        allergens: allergens || null,
        spiceLevel: spiceLevel || "MILD",
        images: images || [],
        variants: variants || null,
        addOns: addOns || null,
        isVegetarian: isVegetarian || false,
        isVegan: isVegan || false,
        isGlutenFree: isGlutenFree || false,
        isAvailable: isAvailable !== undefined ? isAvailable : true,
        isFeatured: isFeatured || false,
        isPopular: isPopular || false,
        tags: tags || [],
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(menuItem, { status: 201 })
  } catch (error) {
    console.error("Error creating menu item:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
