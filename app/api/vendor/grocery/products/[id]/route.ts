import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { isGroceryCategoryAllowed, resolveAllowedGroceryCategoryNames } from "@/lib/groceryProductCategories"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const product = await prisma.groceryProduct.findFirst({
      where: {
        id: params.id,
        storeId: store.id,
      },
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error("Error fetching product:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Verify product belongs to this store
    const existingProduct = await prisma.groceryProduct.findFirst({
      where: {
        id: params.id,
        storeId: store.id,
      },
    })

    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
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

    // Check if SKU already exists for another product in this store
    if (sku && sku !== existingProduct.sku) {
      const existingSku = await prisma.groceryProduct.findFirst({
        where: {
          storeId: store.id,
          sku,
          id: { not: params.id },
        },
      })

      if (existingSku) {
        return NextResponse.json({ error: "SKU already exists for another product" }, { status: 400 })
      }
    }

    const nextCategory = category !== undefined ? category : existingProduct.category
    const nextActive = isActive !== undefined ? isActive : existingProduct.isActive
    if (nextActive) {
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
      if (!(await isGroceryCategoryAllowed(store, nextCategory))) {
        return NextResponse.json(
          {
            error:
              "Product category must match one of the categories enabled in your store profile.",
          },
          { status: 400 }
        )
      }
    }

    const updatedProduct = await prisma.groceryProduct.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price }),
        ...(compareAtPrice !== undefined && { compareAtPrice }),
        ...(category && { category }),
        ...(subcategory !== undefined && { subcategory }),
        ...(brand !== undefined && { brand }),
        ...(sku !== undefined && { sku }),
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
        ...(body.dimensions !== undefined && { dimensions: body.dimensions }),
      },
    })

    return NextResponse.json(updatedProduct)
  } catch (error) {
    console.error("Error updating product:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Verify product belongs to this store
    const product = await prisma.groceryProduct.findFirst({
      where: {
        id: params.id,
        storeId: store.id,
      },
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    await prisma.groceryProduct.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: "Product deleted successfully" })
  } catch (error) {
    console.error("Error deleting product:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
