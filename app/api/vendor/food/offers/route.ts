import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// GET - Get all offers for vendor's restaurant
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const isActive = searchParams.get("isActive") // Optional filter

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const where: any = {
      restaurantId: restaurant.id,
    }

    if (isActive === "true") {
      const now = new Date()
      where.isActive = true
      where.startsAt = { lte: now }
      where.expiresAt = { gte: now }
    } else if (isActive === "false") {
      where.OR = [
        { isActive: false },
        { expiresAt: { lt: new Date() } },
      ]
    }

    const offers = await prisma.restaurantOffer.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ offers })
  } catch (error) {
    console.error("Error fetching restaurant offers:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create new offer
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, discountType, discountValue, minOrderAmount, maxDiscount, itemName, itemPrice, bundleItems, images, startsAt, expiresAt, promoKind, mysteryTeaser } = body

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    // Validate required fields
    if (!title || !discountType || !discountValue || !startsAt || !expiresAt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate itemName and images are required
    if (!body.itemName) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 })
    }

    if (!body.images || !Array.isArray(body.images) || body.images.length === 0) {
      return NextResponse.json({ error: "At least one image is required" }, { status: 400 })
    }

    // Validate dates
    const startDate = new Date(startsAt)
    const endDate = new Date(expiresAt)
    if (endDate <= startDate) {
      return NextResponse.json({ error: "Expiry date must be after start date" }, { status: 400 })
    }

    const kind = typeof promoKind === 'string' ? promoKind : 'REGULAR'
    const needsApproval = kind === 'MYSTERY' || kind === 'FLASH'

    const offer = await prisma.restaurantOffer.create({
      data: {
        restaurantId: restaurant.id,
        title,
        description,
        discountType,
        discountValue: parseFloat(discountValue),
        minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : null,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        itemName: itemName || null,
        itemPrice: itemPrice ? parseFloat(itemPrice) : null,
        bundleItems: Array.isArray(bundleItems) ? bundleItems : null,
        images: images && Array.isArray(images) ? images : null,
        startsAt: startDate,
        expiresAt: endDate,
        isActive: !needsApproval,
        promoKind: kind,
        mysteryTeaser: typeof mysteryTeaser === 'string' ? mysteryTeaser : null,
        approvalStatus: needsApproval ? 'PENDING' : 'APPROVED',
      },
    })

    return NextResponse.json({ offer, pendingApproval: needsApproval }, { status: 201 })
  } catch (error) {
    console.error("Error creating restaurant offer:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}



