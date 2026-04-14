import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { isGroceryCategoryAllowed, resolveAllowedGroceryCategoryNames } from "@/lib/groceryProductCategories"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's grocery store
    const store = await prisma.groceryStore.findUnique({
      where: { userId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
    }

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
      storeId: store.id,
    }

    if (category) {
      where.category = category
    }

    if (status) {
      if (status === "active") {
        where.isActive = true
      } else if (status === "inactive") {
        where.isActive = false
      } else if (status === "low-stock") {
        where.stock = { lte: 10, gt: 0 }
      } else if (status === "out-of-stock") {
        where.stock = 0
      }
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
      orderBy.stock = sortOrder
    } else {
      orderBy.createdAt = sortOrder
    }

    const [products, total] = await Promise.all([
      prisma.groceryProduct.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.groceryProduct.count({ where }),
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
    console.error("Error fetching products:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's grocery store
    const store = await prisma.groceryStore.findUnique({
      where: { userId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
    }

    const body = await request.json()
    const {
      name,
      description,
      price,
      compareAtPrice,
      category,
      subcategory,
      brand,
      sku,
      barcode,
      unit,
      unitSize,
      stock,
      minStock,
      weight,
      images,
      nutritionFacts,
      ingredients,
      allergens,
      expiryDate,
      isOrganic,
      isFrozen,
      isActive,
      isFeatured,
      tags,
    } = body

    // Validate required fields
    if (!name || !price || !category) {
      return NextResponse.json({ error: "Name, price, and category are required" }, { status: 400 })
    }

    const wantLive = isActive !== false
    if (wantLive) {
      const allowed = await resolveAllowedGroceryCategoryNames(store)
      if (allowed.length === 0) {
        return NextResponse.json(
          {
            error:
              "Configure product categories in Store Profile before publishing. Select categories under profile settings.",
          },
          { status: 400 }
        )
      }
      if (!(await isGroceryCategoryAllowed(store, category))) {
        return NextResponse.json(
          {
            error:
              "Product category must match one of the categories enabled in your store profile.",
          },
          { status: 400 }
        )
      }
    }

    // Check if SKU already exists for this store
    if (sku) {
      const existingSku = await prisma.groceryProduct.findFirst({
        where: {
          storeId: store.id,
          sku,
        },
      })

      if (existingSku) {
        return NextResponse.json({ error: "SKU already exists for this store" }, { status: 400 })
      }
    }

    const product = await prisma.groceryProduct.create({
      data: {
        storeId: store.id,
        name,
        description,
        brand,
        category,
        subcategory,
        price,
        compareAtPrice,
        unit: unit || "piece",
        unitSize,
        stock: stock || 0,
        minStock: minStock || 10,
        barcode,
        sku,
        weight,
        dimensions: body.dimensions || null,
        images: images || [],
        nutritionFacts: nutritionFacts || null,
        ingredients: ingredients || null,
        allergens: allergens || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        isOrganic: isOrganic || false,
        isFrozen: isFrozen || false,
        isActive: isActive !== undefined ? isActive : true,
        isFeatured: isFeatured || false,
        tags: tags || [],
      },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error("Error creating product:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
