import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const storeType = searchParams.get("storeType")

    const where: any = {
      isActive: true,
    }

    if (search) {
      where.OR = [
        { storeName: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ]
    }

    if (storeType) {
      where.storeType = {
        has: storeType,
      }
    }

    const stores = await prisma.groceryStore.findMany({
      where,
      select: {
        id: true,
        storeName: true,
        description: true,
        address: true,
        rating: true,
        totalReviews: true,
        deliveryFee: true,
        minOrderAmount: true,
        isOpen: true,
        isVerified: true,
        storeType: true,
      },
      orderBy: [{ rating: "desc" }, { storeName: "asc" }],
    })

    return NextResponse.json({ stores })
  } catch (error) {
    console.error("Error fetching grocery stores:", error)
    return NextResponse.json({ error: "Failed to fetch grocery stores" }, { status: 500 })
  }
}
