import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { formatPropertyListingCard } from "@/lib/property-types"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rows = await prisma.propertyWishlist.findMany({
      where: { userId: user.id },
      include: {
        listing: {
          include: { vendor: { select: { id: true, name: true, avatar: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({
      success: true,
      wishlist: rows.map((r) => formatPropertyListingCard(r.listing)),
    })
  } catch (error) {
    console.error("Property wishlist GET error:", error)
    return NextResponse.json({ error: "Failed to fetch wishlist" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { listingId } = await request.json()
    if (!listingId) {
      return NextResponse.json({ error: "listingId required" }, { status: 400 })
    }

    await prisma.propertyWishlist.upsert({
      where: { userId_listingId: { userId: user.id, listingId } },
      create: { userId: user.id, listingId },
      update: {},
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Property wishlist POST error:", error)
    return NextResponse.json({ error: "Failed to save wishlist" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const listingId = searchParams.get("listingId")
    if (!listingId) {
      return NextResponse.json({ error: "listingId required" }, { status: 400 })
    }

    await prisma.propertyWishlist.deleteMany({
      where: { userId: user.id, listingId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Property wishlist DELETE error:", error)
    return NextResponse.json({ error: "Failed to remove wishlist item" }, { status: 500 })
  }
}
