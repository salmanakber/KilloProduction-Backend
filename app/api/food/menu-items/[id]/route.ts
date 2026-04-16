import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: params.id },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            logo: true,
            isOpen: true,
            rating: true,
            totalReviews: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Customer marketplace: disabled items should disappear.
    if (!menuItem || menuItem.isAvailable === false) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 })
    }

    return NextResponse.json({ menuItem })
  } catch (error) {
    console.error("Menu item fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch menu item" }, { status: 500 })
  }
}
