import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const vendorId = decoded.userId

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const category = searchParams.get("category")
    const status = searchParams.get("status")
    const search = searchParams.get("search")
    const sortBy = searchParams.get("sortBy") || "createdAt"
    const sortOrder = searchParams.get("sortOrder") || "desc"

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {
      vendorId,
      type: "GROCERY",
    }

    if (category) {
      where.categoryId = category
    }

    if (status) {
      where.isActive = status === "active"
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ]
    }

    // Build orderBy clause
    const orderBy: any = {}
    if (sortBy === "name") {
      orderBy.name = sortOrder
    } else if (sortBy === "price") {
      orderBy.price = sortOrder
    } else if (sortBy === "stock") {
      orderBy.stockQuantity = sortOrder
    } else {
      orderBy.createdAt = sortOrder
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: true,
          subcategory: true,
          _count: {
            select: {
              orderItems: true,
              reviews: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ])

    // Calculate additional metrics for each product
    const productsWithMetrics = await Promise.all(
      products.map(async (product) => {
        const [totalSales, averageRating, lowStockAlert] = await Promise.all([
          prisma.orderItem.aggregate({
            where: { productId: product.id },
            _sum: { quantity: true },
          }),
          prisma.review.aggregate({
            where: { productId: product.id },
            _avg: { rating: true },
          }),
          product.stockQuantity <= product.minStockLevel,
        ])

        return {
          ...product,
          totalSales: totalSales._sum.quantity || 0,
          averageRating: averageRating._avg.rating || 0,
          reviewCount: product._count.reviews,
          orderCount: product._count.orderItems,
          lowStockAlert,
          stockStatus:
            product.stockQuantity === 0
              ? "out_of_stock"
              : product.stockQuantity <= product.minStockLevel
                ? "low_stock"
                : "in_stock",
        }
      }),
    )

    return NextResponse.json({
      products: productsWithMetrics,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching products:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const vendorId = decoded.userId

    const body = await request.json()
    const {
      name,
      description,
      price,
      comparePrice,
      categoryId,
      subcategoryId,
      brand,
      sku,
      barcode,
      weight,
      weightUnit,
      stockQuantity,
      minStockLevel,
      maxStockLevel,
      images,
      isActive,
      isFeatured,
      tags,
      nutritionInfo,
      storageInstructions,
      expiryDate,
      manufacturingDate,
      origin,
    } = body

    // Validate required fields
    if (!name || !price || !categoryId) {
      return NextResponse.json({ error: "Name, price, and category are required" }, { status: 400 })
    }

    // Check if SKU already exists for this vendor
    if (sku) {
      const existingSku = await prisma.product.findFirst({
        where: {
          vendorId,
          sku,
        },
      })

      if (existingSku) {
        return NextResponse.json({ error: "SKU already exists" }, { status: 400 })
      }
    }

    const product = await prisma.product.create({
      data: {
        name,
        description,
        price,
        comparePrice,
        categoryId,
        subcategoryId,
        brand,
        sku,
        barcode,
        weight,
        weightUnit,
        stockQuantity,
        minStockLevel,
        maxStockLevel,
        images,
        isActive,
        isFeatured,
        tags,
        nutritionInfo,
        storageInstructions,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        manufacturingDate: manufacturingDate ? new Date(manufacturingDate) : null,
        origin,
        vendorId,
        type: "GROCERY",
      },
      include: {
        category: true,
        subcategory: true,
      },
    })

    // Create inventory tracking record
    await prisma.inventoryTransaction.create({
      data: {
        productId: product.id,
        type: "STOCK_IN",
        quantity: stockQuantity,
        reason: "Initial stock",
        vendorId,
      },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error("Error creating product:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
