import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { canTurnOnlineNow } from "@/lib/openingHours"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        description: true,
        address: true,
        phone: true,
        email: true,
        logo: true,
        coverImage: true,
        isVerified: true,
        isOpen: true,
        rating: true,
        totalReviews: true,
        totalOrders: true,
        createdAt: true,
        updatedAt: true,
      }
    })

    if (!restaurant) {
      return NextResponse.json({ 
        hasRestaurant: false,
        isVerified: false,
      })
    }
    

    return NextResponse.json({
      hasRestaurant: true,
      isVerified: restaurant.isVerified,
      restaurant: restaurant,
    })
  } catch (error) {
    console.error("Restaurant status error:", error)
    return NextResponse.json({ 
      error: "Failed to get restaurant status" 
    }, { status: 500 })
  }
}

// PUT - Update restaurant status (isOpen)
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { isOpen } = body

    if (typeof isOpen !== "boolean") {
      return NextResponse.json({ error: "isOpen must be a boolean" }, { status: 400 })
    }

    if (isOpen) {
      const r = await prisma.restaurant.findUnique({
        where: { userId: user.id },
        select: { openingHours: true },
      })
      const gate = canTurnOnlineNow(r?.openingHours)
      if (!gate.ok) {
        return NextResponse.json({ error: gate.message }, { status: 400 })
      }
    }

    const restaurant = await prisma.restaurant.update({
      where: { userId: user.id },
      data: { isOpen },
      select: {
        id: true,
        name: true,
        isOpen: true,
      }
    })

    return NextResponse.json({ restaurant })
  } catch (error) {
    console.error("Error updating restaurant status:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
