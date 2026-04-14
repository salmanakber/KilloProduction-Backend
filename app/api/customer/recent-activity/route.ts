import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import type { Module } from "@prisma/client"

const ACTIVE = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "PICKED_UP",
  "IN_TRANSIT",
  "RIDER_ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_AT_PICKUP",
  "ARRIVED_AT_DROPOFF",
]

/**
 * Recent orders + reviews for a module home “activity” strip.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const rawMod = searchParams.get("module") || "PHARMACY"
    const allowed: Module[] = ["PHARMACY", "FOOD", "GROCERY", "AUTO_PARTS"]
    const module = (allowed.includes(rawMod as Module) ? rawMod : "PHARMACY") as Module
    const limit = Math.min(15, Math.max(1, Number.parseInt(searchParams.get("limit") || "4", 10)))

    const since = new Date()
    since.setDate(since.getDate() - 14)

    const [orders, reviews] = await Promise.all([
      prisma.order.findMany({
        where: {
          customerId: user.id,
          module,
          status: { not: "DRAFT" },
          updatedAt: { gte: since },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          total: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      prisma.review.findMany({
        where: {
          userId: user.id,
          orderId: { not: null },
          order: { module },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          targetType: true,
          orderId: true,
        },
      }),
    ])

    type ActivityItem = {
      id: string
      kind: "order" | "review"
      title: string
      subtitle?: string
      createdAt: string
      data?: Record<string, unknown>
    }

    const items: ActivityItem[] = []

    for (const o of orders) {
      const active = ACTIVE.includes(String(o.status))
      items.push({
        id: `order-${o.id}`,
        kind: "order",
        title: active ? `Order ${o.orderNumber} · ${String(o.status).replace(/_/g, " ")}` : `Order ${o.orderNumber} · ${String(o.status).replace(/_/g, " ")}`,
        subtitle: o.paymentStatus === "PAID" ? "Paid" : String(o.paymentStatus),
        createdAt: o.updatedAt.toISOString(),
        data: { orderId: o.id, orderNumber: o.orderNumber, status: o.status },
      })
    }

    for (const r of reviews) {
      items.push({
        id: `review-${r.id}`,
        kind: "review",
        title: `You rated ${String(r.targetType).toLowerCase()} · ${r.rating}★`,
        subtitle: r.comment ? String(r.comment).slice(0, 72) : undefined,
        createdAt: r.createdAt.toISOString(),
        data: { reviewId: r.id, rating: r.rating, orderId: r.orderId || undefined },
      })
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({
      success: true,
      items: items.slice(0, limit),
    })
  } catch (e) {
    console.error("recent-activity:", e)
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 })
  }
}
