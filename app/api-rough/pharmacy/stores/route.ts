import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const isOpen = searchParams.get("isOpen")
    const is24Hours = searchParams.get("is24Hours")
    const deliveryAvailable = searchParams.get("deliveryAvailable")

    const where: any = {
      isActive: true,
    }

    if (search) {
      where.OR = [
        { pharmacyName: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ]
    }

    if (isOpen === "true") {
      where.isOpen = true
    }

    if (is24Hours === "true") {
      where.is24Hours = true
    }

    if (deliveryAvailable === "true") {
      where.deliveryAvailable = true
    }

    const pharmacies = await prisma.pharmacy.findMany({
      where,
      select: {
        id: true,
        pharmacyName: true,
        address: true,
        phone: true,
        rating: true,
        isVerified: true,
        is24Hours: true,
        deliveryAvailable: true,
        isOpen: true,
      },
      orderBy: [{ rating: "desc" }, { pharmacyName: "asc" }],
    })

    return NextResponse.json({ pharmacies })
  } catch (error) {
    console.error("Error fetching pharmacy stores:", error)
    return NextResponse.json({ error: "Failed to fetch pharmacy stores" }, { status: 500 })
  }
}
