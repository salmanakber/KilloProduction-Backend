import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Verify API key and get restaurant
async function verifyApiKey(apiKey: string | null) {
  if (!apiKey) {
    return null
  }

  const restaurant = await prisma.restaurant.findFirst({
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
  return restaurant
}

// GET - Fetch all menu items for POS integration
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "")

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 401 })
    }

    const restaurant = await verifyApiKey(apiKey)
    if (!restaurant) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "100")
    const categoryId = searchParams.get("categoryId")
    const status = searchParams.get("status")

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
    console.error("POS fetch menu items error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create or update menu items from POS
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "")

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 401 })
    }

    const restaurant = await verifyApiKey(apiKey)
    if (!restaurant) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 })
    }

    const body = await request.json()
    const { menuItems } = body

    if (!menuItems || !Array.isArray(menuItems)) {
      return NextResponse.json({ error: "Menu items array is required" }, { status: 400 })
    }

    const results = []

    for (const itemData of menuItems) {
      try {
        const {
          externalId, // POS system's ID for this item
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
          isVegetarian,
          isVegan,
          isGlutenFree,
          isAvailable,
          isFeatured,
          isPopular,
          tags,
        } = itemData

        if (!name || !price) {
          results.push({ externalId, error: "Name and price are required" })
          continue
        }

        // Try to find existing menu item by externalId if provided
        // For now, we'll match by name and restaurantId
        const existingItem = await prisma.menuItem.findFirst({
          where: {
            restaurantId: restaurant.id,
            name,
          },
        })

        if (existingItem) {
          // Update existing menu item
          const updated = await prisma.menuItem.update({
            where: { id: existingItem.id },
            data: {
              name,
              description,
              price,
              ...(compareAtPrice !== undefined && { compareAtPrice }),
              ...(categoryId !== undefined && { categoryId: categoryId || null }),
              ...(preparationTime !== undefined && { preparationTime }),
              ...(calories !== undefined && { calories }),
              ...(ingredients !== undefined && { ingredients }),
              ...(allergens !== undefined && { allergens }),
              ...(spiceLevel !== undefined && { spiceLevel }),
              ...(images !== undefined && { images }),
              ...(isVegetarian !== undefined && { isVegetarian }),
              ...(isVegan !== undefined && { isVegan }),
              ...(isGlutenFree !== undefined && { isGlutenFree }),
              ...(isAvailable !== undefined && { isAvailable }),
              ...(isFeatured !== undefined && { isFeatured }),
              ...(isPopular !== undefined && { isPopular }),
              ...(tags !== undefined && { tags }),
            },
          })
          results.push({ externalId, action: "updated", id: updated.id })
        } else {
          // Create new menu item
          const created = await prisma.menuItem.create({
            data: {
              restaurantId: restaurant.id,
              categoryId: categoryId || null,
              name,
              description,
              price,
              compareAtPrice,
              preparationTime: preparationTime || 15,
              calories,
              ingredients: ingredients || null,
              allergens: allergens || null,
              spiceLevel: spiceLevel || "MILD",
              images: images || [],
              isVegetarian: isVegetarian || false,
              isVegan: isVegan || false,
              isGlutenFree: isGlutenFree || false,
              isAvailable: isAvailable !== undefined ? isAvailable : true,
              isFeatured: isFeatured || false,
              isPopular: isPopular || false,
              tags: tags || [],
            },
          })
          results.push({ externalId, action: "created", id: created.id })
        }
      } catch (error: any) {
        results.push({ externalId: itemData.externalId, error: error.message || "Failed to process menu item" })
      }
    }

    return NextResponse.json({
      message: "Menu items processed",
      results,
      totalProcessed: results.length,
      successful: results.filter((r) => !r.error).length,
      failed: results.filter((r) => r.error).length,
    })
  } catch (error) {
    console.error("POS create/update menu items error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
