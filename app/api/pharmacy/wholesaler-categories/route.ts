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

    // Check if pharmacy is verified
    if (!pharmacy.isVerified) {
      return NextResponse.json({ 
        error: "Pharmacy account must be verified before accessing wholesaler categories",
        code: "VERIFICATION_REQUIRED"
      }, { status: 403 })
    }

    // Get unique categories from active wholesaler products
    const categories = await prisma.wholesalerProduct.groupBy({
      by: ['category'],
      where: {
        isActive: true,
        stock: { gt: 0 },
        expiryDate: { gt: new Date() },
        wholesaler: {
          isVerified: true,
          user: {
            isActive: true
          }
        }
      },
      _count: {
        category: true
      },
      orderBy: {
        _count: {
          category: 'desc'
        }
      }
    })

    // Format the response
    const formattedCategories = categories.map(cat => ({
      name: cat.category,
      productCount: cat._count.category
    }))

    return NextResponse.json({
      categories: formattedCategories,
      total: formattedCategories.length
    })
  } catch (error) {
    console.error("Wholesaler categories fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch wholesaler categories" }, { status: 500 })
  }
}
