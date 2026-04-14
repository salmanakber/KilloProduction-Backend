import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// GET - Get specific offer
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const offer = await prisma.restaurantOffer.findFirst({
      where: {
        id: params.id,
        restaurantId: restaurant.id,
      },
    })

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    return NextResponse.json({ offer })
  } catch (error) {
    console.error("Error fetching offer:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT - Update offer
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    // Verify offer belongs to this restaurant
    const existingOffer = await prisma.restaurantOffer.findFirst({
      where: {
        id: params.id,
        restaurantId: restaurant.id,
      },
    })

    if (!existingOffer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    const body = await request.json()
    const { title, description, discountType, discountValue, minOrderAmount, maxDiscount, itemName, itemPrice, images, startsAt, expiresAt, isActive, promoKind, mysteryTeaser } = body

    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (discountType !== undefined) updateData.discountType = discountType
    if (discountValue !== undefined) updateData.discountValue = parseFloat(discountValue)
    if (minOrderAmount !== undefined) updateData.minOrderAmount = minOrderAmount ? parseFloat(minOrderAmount) : null
    if (maxDiscount !== undefined) updateData.maxDiscount = maxDiscount ? parseFloat(maxDiscount) : null
    if (itemName !== undefined) updateData.itemName = itemName || null
    if (itemPrice !== undefined) updateData.itemPrice = itemPrice ? parseFloat(itemPrice) : null
    if (images !== undefined) updateData.images = images && Array.isArray(images) ? images : null
    if (startsAt !== undefined) updateData.startsAt = new Date(startsAt)
    if (expiresAt !== undefined) updateData.expiresAt = new Date(expiresAt)
    if (isActive !== undefined) updateData.isActive = isActive
    if (promoKind !== undefined) updateData.promoKind = promoKind
    if (mysteryTeaser !== undefined) updateData.mysteryTeaser = mysteryTeaser || null

    // Validate dates if both provided
    if (updateData.startsAt && updateData.expiresAt && updateData.expiresAt <= updateData.startsAt) {
      return NextResponse.json({ error: "Expiry date must be after start date" }, { status: 400 })
    }

    const offer = await prisma.restaurantOffer.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json({ offer })
  } catch (error) {
    console.error("Error updating offer:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete offer
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    // Verify offer belongs to this restaurant
    const offer = await prisma.restaurantOffer.findFirst({
      where: {
        id: params.id,
        restaurantId: restaurant.id,
      },
    })

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    await prisma.restaurantOffer.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: "Offer deleted successfully" })
  } catch (error) {
    console.error("Error deleting offer:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}



