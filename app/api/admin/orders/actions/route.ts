import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const actor = await authenticateRequest(request)
    if (!actor?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { id, entityType, action } = body as { id?: string; entityType?: "MARKETPLACE" | "SUPPLIER"; action?: "CANCEL" | "DELIVER" | "REFUND" }
    if (!id || !entityType || !action) return NextResponse.json({ error: "id, entityType and action are required" }, { status: 400 })

    if (entityType === "MARKETPLACE") {
      if (action === "CANCEL") {
        await prisma.order.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } })
      } else if (action === "DELIVER") {
        await prisma.order.update({ where: { id }, data: { status: "DELIVERED", deliveredAt: new Date(), paymentStatus: "PAID" } })
      } else if (action === "REFUND") {
        await prisma.order.update({ where: { id }, data: { status: "REFUNDED", paymentStatus: "REFUNDED" } })
      }
    } else {
      if (action === "CANCEL") {
        await prisma.supplierOrder.update({ where: { id }, data: { status: "CANCELLED" } })
      } else if (action === "DELIVER") {
        await prisma.supplierOrder.update({ where: { id }, data: { status: "DELIVERED", paymentStatus: "PAID" } })
      } else if (action === "REFUND") {
        await prisma.supplierOrder.update({ where: { id }, data: { paymentStatus: "REFUNDED" } })
      }
    }

    await prisma.auditLog.create({
      data: {
        performedBy: actor.id,
        action: `ADMIN_ORDER_${action}`,
        entityType,
        entityId: id,
        details: { action, updatedAt: new Date().toISOString() },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("admin order action:", error)
    return NextResponse.json({ error: "Failed to update order action" }, { status: 500 })
  }
}
