import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const items = await prisma.menuItem.findMany({
      where: {
        isActive: true,
        isFeatured: true,
        isAvailable: true,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            isOpen: true,
          },
        },
      },
      orderBy: [{ isPopular: "desc" }, { createdAt: "desc" }],
      take: 10,
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error("Error fetching featured items:", error)
    return NextResponse.json({ error: "Failed to fetch featured items" }, { status: 500 })
  }
}
