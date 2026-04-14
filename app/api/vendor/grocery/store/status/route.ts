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

    const store = await prisma.groceryStore.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        storeName: true,
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
      },
    })

    if (!store) {
      return NextResponse.json({
        hasStore: false,
        isVerified: false,
      })
    }

    return NextResponse.json({
      hasStore: true,
      isVerified: store.isVerified,
      store,
    })
  } catch (error) {
    console.error("Grocery store status error:", error)
    return NextResponse.json({ error: "Failed to get store status" }, { status: 500 })
  }
}

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
      const s = await prisma.groceryStore.findUnique({
        where: { userId: user.id },
        select: { openingHours: true },
      })
      const gate = canTurnOnlineNow(s?.openingHours)
      if (!gate.ok) {
        return NextResponse.json({ error: gate.message }, { status: 400 })
      }
    }

    const store = await prisma.groceryStore.update({
      where: { userId: user.id },
      data: { isOpen },
      select: { id: true, storeName: true, isOpen: true },
    })

    return NextResponse.json({ store })
  } catch (error) {
    console.error("Error updating grocery store status:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
