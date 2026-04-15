import { type NextRequest, NextResponse } from "next/server"
import { Module } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { authenticatePosRequest } from "@/lib/pos-integration-auth"

export async function GET(request: NextRequest) {
  const ctx = await authenticatePosRequest(request, "orders:read")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const take = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 30))

  if (ctx.module === "FOOD" && ctx.restaurantId) {
    const orders = await prisma.order.findMany({
      where: {
        module: Module.FOOD,
        foodId: ctx.restaurantId,
      },
      take,
      orderBy: { createdAt: "desc" },
      include: {
        orderItems: { take: 50 },
        customer: { select: { id: true, name: true, phone: true } },
      },
    })
    return NextResponse.json({ orders })
  }

  if (ctx.module === "GROCERY" && ctx.groceryStoreId) {
    const orders = await prisma.order.findMany({
      where: {
        module: Module.GROCERY,
        groceryId: ctx.groceryStoreId,
      },
      take,
      orderBy: { createdAt: "desc" },
      include: {
        orderItems: { take: 50 },
        customer: { select: { id: true, name: true, phone: true } },
      },
    })
    return NextResponse.json({ orders })
  }

  return NextResponse.json({ error: "Integration misconfigured" }, { status: 400 })
}

/**
 * Creating orders from POS is not fully wired to checkout — return 501 with guidance.
 */
export async function POST(request: NextRequest) {
  const ctx = await authenticatePosRequest(request, "orders:write")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "Order creation from POS should use the same checkout pipeline as the app (inventory, fees, rider dispatch). Use webhooks or extend this endpoint with your order payload contract.",
    },
    { status: 501 }
  )
}
