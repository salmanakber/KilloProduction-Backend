import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    // Get available wholesalers
    const wholesalers = await prisma.wholesaler.findMany({
      where: {
        isVerified: true,
        isActive: true,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
        wholesalerProducts: {
          take: 5, // Sample products
          select: {
            name: true,
            category: true,
            unitPrice: true,
            countryOfOrigin: true,
          },
        },
        _count: {
          select: {
            wholesalerProducts: true,
          },
        },
      },
      orderBy: { rating: "desc" },
    })

    return NextResponse.json({ wholesalers })
  } catch (error) {
    console.error("Suppliers fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 })
  }
}
