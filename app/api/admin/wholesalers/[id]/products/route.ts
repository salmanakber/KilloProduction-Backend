import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateFromCookie } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesalerId = params.id

    // Verify wholesaler exists
    const wholesaler = await prisma.wholesaler.findUnique({
      where: { id: wholesalerId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            role: true,
          }
        }
      }
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const status = searchParams.get("status")

    const where: any = { wholesalerId }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
      ]
    }

    if (category) where.category = category
    if (status === "active") where.isActive = true
    if (status === "inactive") where.isActive = false
    if (status === "expiring") {
      where.expiryDate = {
        lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
        gt: new Date(),
      }
    }
    if (status === "expired") {
      where.expiryDate = {
        lte: new Date(),
      }
    }
    if (status === "low-stock") {
      where.stock = {
        lte: 10,
        gt: 0,
      }
    }
    if (status === "out-of-stock") {
      where.stock = 0
    }

    const [products, total] = await Promise.all([
      prisma.wholesalerProduct.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.wholesalerProduct.count({ where }),
    ])

    return NextResponse.json({
      products,
      wholesaler: {
        id: wholesaler.id,
        companyName: wholesaler.companyName,
        user: wholesaler.user,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Wholesaler products fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch wholesaler products" }, { status: 500 })
  }
}
