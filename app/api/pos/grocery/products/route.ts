import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Verify API key and get store
async function verifyApiKey(apiKey: string | null) {
  if (!apiKey) {
    return null
  }

  const store = await prisma.groceryStore.findFirst({
    where: { apiKey },
    include: {
      user: {
        select: {
          id: true,
          role: true,
        },
      },
    },
  })
  return store
}

// GET - Fetch all products for POS integration
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "")

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 401 })
    }

    const store = await verifyApiKey(apiKey)
    if (!store) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "100")
    const category = searchParams.get("category")
    const status = searchParams.get("status")

    const where: any = {
      storeId: store.id,
    }

    if (category) {
      where.category = category
    }

    if (status === "active") {
      where.isActive = true
    } else if (status === "inactive") {
      where.isActive = false
    }

    const [products, total] = await Promise.all([
      prisma.groceryProduct.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
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
    console.error("POS fetch products error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create or update products from POS
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "")

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 401 })
    }

    const store = await verifyApiKey(apiKey)
    if (!store) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 })
    }

    const body = await request.json()
    const { products } = body

    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ error: "Products array is required" }, { status: 400 })
    }

    const results = []

    for (const productData of products) {
      try {
        const {
          sku,
          name,
          description,
          price,
          compareAtPrice,
          category,
          subcategory,
          brand,
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
        } = productData

        if (!name || !price || !category) {
          results.push({ sku, error: "Name, price, and category are required" })
          continue
        }

        // Check if product exists by SKU
        const existingProduct = sku
          ? await prisma.groceryProduct.findFirst({
              where: {
                storeId: store.id,
                sku,
              },
            })
          : null

        if (existingProduct) {
          // Update existing product
          const updated = await prisma.groceryProduct.update({
            where: { id: existingProduct.id },
            data: {
              name,
              description,
              price,
              ...(compareAtPrice !== undefined && { compareAtPrice }),
              category,
              ...(subcategory !== undefined && { subcategory }),
              ...(brand !== undefined && { brand }),
              ...(barcode !== undefined && { barcode }),
              ...(unit !== undefined && { unit }),
              ...(unitSize !== undefined && { unitSize }),
              ...(stock !== undefined && { stock }),
              ...(minStock !== undefined && { minStock }),
              ...(weight !== undefined && { weight }),
              ...(images !== undefined && { images }),
              ...(nutritionFacts !== undefined && { nutritionFacts }),
              ...(ingredients !== undefined && { ingredients }),
              ...(allergens !== undefined && { allergens }),
              ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
              ...(isOrganic !== undefined && { isOrganic }),
              ...(isFrozen !== undefined && { isFrozen }),
              ...(isActive !== undefined && { isActive }),
              ...(isFeatured !== undefined && { isFeatured }),
              ...(tags !== undefined && { tags }),
            },
          })
          results.push({ sku, action: "updated", id: updated.id })
        } else {
          // Create new product
          const created = await prisma.groceryProduct.create({
            data: {
              storeId: store.id,
              name,
              description,
              price,
              compareAtPrice,
              category,
              subcategory,
              brand,
              barcode,
              sku: sku || undefined,
              unit: unit || "piece",
              unitSize,
              stock: stock || 0,
              minStock: minStock || 10,
              weight,
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
          results.push({ sku, action: "created", id: created.id })
        }
      } catch (error: any) {
        results.push({ sku: productData.sku, error: error.message || "Failed to process product" })
      }
    }

    return NextResponse.json({
      message: "Products processed",
      results,
      totalProcessed: results.length,
      successful: results.filter((r) => !r.error).length,
      failed: results.filter((r) => r.error).length,
    })
  } catch (error) {
    console.error("POS create/update products error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
