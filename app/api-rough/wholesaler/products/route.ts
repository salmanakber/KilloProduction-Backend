import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
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

    const where: any = { wholesalerId: wholesaler.id }

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
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Wholesaler products fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const data = await request.json()

    // Validate required fields
    const requiredFields = [
      "name",
      "dosage",
      "form",
      "category",
      "unitPrice",
      "minOrderQuantity",
      "stock",
      "expiryDate",
      "countryOfOrigin",
    ]
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 })
      }
    }

    const product = await prisma.wholesalerProduct.create({
      data: {
        ...data,
        wholesalerId: wholesaler.id,
        expiryDate: new Date(data.expiryDate),
        images: data.images || [],
      },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error("Wholesaler product creation error:", error)
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 })
  }
}
