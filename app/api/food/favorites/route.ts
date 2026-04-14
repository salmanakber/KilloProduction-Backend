import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// GET - Get user's favorite restaurants
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const favorites = await prisma.favoriteRestaurant.findMany({
      where: {
        userId: user.id,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            logo: true,
            coverImage: true,
            rating: true,
            totalReviews: true,
            isOpen: true,
            isVerified: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({
      favorites: favorites.map(fav => ({
        id: fav.id,
        restaurantId: fav.restaurantId,
        createdAt: fav.createdAt,
        restaurant: fav.restaurant,
      })),
    })
  } catch (error) {
    console.error("Error fetching favorites:", error)
    return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 })
  }
}

// POST - Add restaurant to favorites
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { restaurantId } = body

    if (!restaurantId) {
      return NextResponse.json({ error: "Restaurant ID is required" }, { status: 400 })
    }

    // Check if already favorited
    const existing = await prisma.favoriteRestaurant.findUnique({
      where: {
        userId_restaurantId: {
          userId: user.id,
          restaurantId,
        },
      },
    })

    if (existing) {
      return NextResponse.json({ 
        success: true, 
        message: "Already in favorites",
        favorite: existing,
      })
    }

    const favorite = await prisma.favoriteRestaurant.create({
      data: {
        userId: user.id,
        restaurantId,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            logo: true,
            coverImage: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Added to favorites",
      favorite,
    })
  } catch (error) {
    console.error("Error adding favorite:", error)
    return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 })
  }
}

// DELETE - Remove restaurant from favorites
export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get("restaurantId")

    if (!restaurantId) {
      return NextResponse.json({ error: "Restaurant ID is required" }, { status: 400 })
    }

    await prisma.favoriteRestaurant.deleteMany({
      where: {
        userId: user.id,
        restaurantId,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Removed from favorites",
    })
  } catch (error) {
    console.error("Error removing favorite:", error)
    return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 })
  }
}
