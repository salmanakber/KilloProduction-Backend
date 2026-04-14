import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const product = await prisma.product.findFirst({
      where: {
        id: params.id,
        vendorId: user.id,
        type: "AUTO_PART",
      },
      include: {
        category: true,
        reviews: {
          include: {
            user: {
              select: {
                name: true,
                avatar: true,
              },
            },
          },
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            reviews: true,
          },
        },
      },
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error("Product fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 })
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

    // Verify product belongs to vendor
    const existingProduct = await prisma.product.findFirst({
      where: {
        id: params.id,
        vendorId: user.id,
        type: "AUTO_PART",
      },
    })

    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const data = await request.json()

    const product = await prisma.product.update({
      where: { id: params.id },
      data: {
        name: data.name,
        description: data.description,
        price: data.price ? parseFloat(data.price) : undefined,
        comparePrice: data.comparePrice ? parseFloat(data.comparePrice) : undefined,
        stockQuantity: data.stockQuantity !== undefined ? parseInt(data.stockQuantity) : undefined,
        categoryId: data.categoryId,
        brand: data.brand,
        sku: data.sku,
        images: data.images,
        isActive: data.isActive,
        isFeatured: data.isFeatured,
        specifications: data.specifications,
      },
    })

    return NextResponse.json({ product })
  } catch (error) {
    console.error("Product update error:", error)
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "AUTOPARTS") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify product belongs to vendor
    const existingProduct = await prisma.product.findFirst({
      where: {
        id: params.id,
        vendorId: user.id,
        type: "AUTO_PART",
      },
    })

    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Soft delete by setting isActive to false
    await prisma.product.update({
      where: { id: params.id },
      data: { isActive: false },
    })

    return NextResponse.json({ message: "Product deleted successfully" })
  } catch (error) {
    console.error("Product delete error:", error)
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 })
  }
}

