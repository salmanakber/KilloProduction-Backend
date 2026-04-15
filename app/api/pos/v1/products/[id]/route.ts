import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticatePosRequest } from "@/lib/pos-integration-auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await authenticatePosRequest(request, "products:read")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (ctx.module === "FOOD" && ctx.restaurantId) {
    const item = await prisma.menuItem.findFirst({
      where: { id: params.id, restaurantId: ctx.restaurantId },
    })
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ item })
  }
  if (ctx.module === "GROCERY" && ctx.groceryStoreId) {
    const product = await prisma.groceryProduct.findFirst({
      where: { id: params.id, storeId: ctx.groceryStoreId },
    })
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ product })
  }
  return NextResponse.json({ error: "Bad integration" }, { status: 400 })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await authenticatePosRequest(request, "products:write")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))

  if (ctx.module === "FOOD" && ctx.restaurantId) {
    const existing = await prisma.menuItem.findFirst({
      where: { id: params.id, restaurantId: ctx.restaurantId },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const item = await prisma.menuItem.update({
      where: { id: params.id },
      data: {
        ...(body.name != null && { name: String(body.name) }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.price != null && { price: Number(body.price) }),
        ...(body.preparationTime != null && { preparationTime: Number(body.preparationTime) }),
        ...(body.isAvailable != null && { isAvailable: Boolean(body.isAvailable) }),
        ...(body.images !== undefined && { images: body.images }),
      },
    })
    return NextResponse.json({ item })
  }

  if (ctx.module === "GROCERY" && ctx.groceryStoreId) {
    const existing = await prisma.groceryProduct.findFirst({
      where: { id: params.id, storeId: ctx.groceryStoreId },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const product = await prisma.groceryProduct.update({
      where: { id: params.id },
      data: {
        ...(body.name != null && { name: String(body.name) }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.price != null && { price: Number(body.price) }),
        ...(body.stock != null && { stock: Number(body.stock) }),
        ...(body.category != null && { category: String(body.category) }),
        ...(body.isActive != null && { isActive: Boolean(body.isActive) }),
        ...(body.images !== undefined && { images: body.images }),
      },
    })
    return NextResponse.json({ product })
  }

  return NextResponse.json({ error: "Bad integration" }, { status: 400 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await authenticatePosRequest(request, "products:write")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (ctx.module === "FOOD" && ctx.restaurantId) {
    const existing = await prisma.menuItem.findFirst({
      where: { id: params.id, restaurantId: ctx.restaurantId },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await prisma.menuItem.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  }
  if (ctx.module === "GROCERY" && ctx.groceryStoreId) {
    const existing = await prisma.groceryProduct.findFirst({
      where: { id: params.id, storeId: ctx.groceryStoreId },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await prisma.groceryProduct.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: "Bad integration" }, { status: 400 })
}
