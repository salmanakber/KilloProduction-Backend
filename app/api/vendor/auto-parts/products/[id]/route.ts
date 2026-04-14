import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.autoPartsStore.findUnique({
      where: { userId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Auto parts store not found" }, { status: 404 })
    }

    const product = await prisma.autoPart.findFirst({
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
    console.error("Product fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.autoPartsStore.findUnique({
      where: { userId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Auto parts store not found" }, { status: 404 })
    }

    const data = await request.json()

    const product = await prisma.autoPart.updateMany({
      where: {
        id: params.id,
        storeId: store.id,
      },
      data,
    })

    if (product.count === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const updatedProduct = await prisma.autoPart.findUnique({
      where: { id: params.id },
    })

    return NextResponse.json(updatedProduct)
  } catch (error) {
    console.error("Product update error:", error)
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.autoPartsStore.findUnique({
      where: { userId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Auto parts store not found" }, { status: 404 })
    }

    const product = await prisma.autoPart.deleteMany({
      where: {
        id: params.id,
        storeId: store.id,
      },
    })

    if (product.count === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    return NextResponse.json({ message: "Product deleted successfully" })
  } catch (error) {
    console.error("Product deletion error:", error)
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 })
  }
}
