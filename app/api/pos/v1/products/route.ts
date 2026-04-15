import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticatePosRequest } from "@/lib/pos-integration-auth"

export async function GET(request: NextRequest) {
  const ctx = await authenticatePosRequest(request, "products:read")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (ctx.module === "FOOD" && ctx.restaurantId) {
    const items = await prisma.menuItem.findMany({
      where: { restaurantId: ctx.restaurantId },
      take: 200,
      orderBy: { updatedAt: "desc" },
    })
    return NextResponse.json({ module: "FOOD", items })
  }

  if (ctx.module === "GROCERY" && ctx.groceryStoreId) {
    const products = await prisma.groceryProduct.findMany({
      where: { storeId: ctx.groceryStoreId },
      take: 200,
      orderBy: { updatedAt: "desc" },
    })
    return NextResponse.json({ module: "GROCERY", products })
  }

  return NextResponse.json({ error: "Integration misconfigured" }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const ctx = await authenticatePosRequest(request, "products:write")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))

  if (ctx.module === "FOOD" && ctx.restaurantId) {
    const name = String(body.name || "").trim()
    const price = Number(body.price)
    const preparationTime = Math.max(1, Number(body.preparationTime) || 15)
    if (!name || !Number.isFinite(price)) {
      return NextResponse.json({ error: "name and price required" }, { status: 400 })
    }
    const item = await prisma.menuItem.create({
      data: {
        restaurantId: ctx.restaurantId,
        categoryId: body.categoryId || null,
        name,
        description: body.description ?? null,
        price,
        preparationTime,
        images: body.images ?? undefined,
        isAvailable: body.isAvailable !== false,
      },
    })
    return NextResponse.json({ item }, { status: 201 })
  }

  if (ctx.module === "GROCERY" && ctx.groceryStoreId) {
    const name = String(body.name || "").trim()
    const price = Number(body.price)
    const category = String(body.category || "General").trim()
    const unit = String(body.unit || "pcs")
    const stock = Math.max(0, Number(body.stock) || 0)
    if (!name || !Number.isFinite(price)) {
      return NextResponse.json({ error: "name and price required" }, { status: 400 })
    }
    const product = await prisma.groceryProduct.create({
      data: {
        storeId: ctx.groceryStoreId,
        name,
        description: body.description ?? null,
        brand: body.brand ?? null,
        category,
        subcategory: body.subcategory ?? null,
        price,
        unit,
        stock,
        barcode: body.barcode ?? null,
        sku: body.sku ?? null,
        images: body.images ?? undefined,
        isActive: body.isActive !== false,
      },
    })
    return NextResponse.json({ product }, { status: 201 })
  }

  return NextResponse.json({ error: "Integration misconfigured" }, { status: 400 })
}
