import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// GET - Get specific offer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Get vendor's grocery store
    const store = await prisma.groceryStore.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (!store) {
      return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
    }

    const offer = await prisma.groceryOffer.findFirst({
      where: {
        id,
        storeId: store.id,
      },
    })

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    return NextResponse.json({ offer })
  } catch (error) {
    console.error("Error fetching grocery offer:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT - Update offer
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Get vendor's grocery store
    const store = await prisma.groceryStore.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (!store) {
      return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
    }

    // Verify offer belongs to this store
    const existingOffer = await prisma.groceryOffer.findFirst({
      where: {
        id,
        storeId: store.id,
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

    const offer = await prisma.groceryOffer.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ offer })
  } catch (error) {
    console.error("Error updating grocery offer:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete offer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Get vendor's grocery store
    const store = await prisma.groceryStore.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (!store) {
      return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
    }

    // Verify offer belongs to this store
    const offer = await prisma.groceryOffer.findFirst({
      where: {
        id,
        storeId: store.id,
      },
    })

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    await prisma.groceryOffer.delete({
      where: { id },
    })

    return NextResponse.json({ message: "Offer deleted successfully" })
  } catch (error) {
    console.error("Error deleting grocery offer:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
