import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const module = (searchParams.get("module") || "").toUpperCase()
    const role = searchParams.get("role") || "customer"
    const limit = Math.min(15, Math.max(1, parseInt(searchParams.get("limit") || "8")))

    if (module !== "FOOD" && module !== "GROCERY") {
      return NextResponse.json({ error: "module must be FOOD or GROCERY" }, { status: 400 })
    }

    const activities: any[] = []

    if (role === "customer") {
      const recentOrders = await prisma.order.findMany({
        where: { customerId: session.id, module: module as any },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true, orderNumber: true, status: true, total: true,
          createdAt: true, orderItems: true,
        },
      })

      for (const order of recentOrders) {
        const itemsList = Array.isArray(order.orderItems) ? order.orderItems as any[] : []
        const firstItem = itemsList[0]
        activities.push({
          id: order.id,
          kind: "order",
          title: `Order #${order.orderNumber}`,
          subtitle: firstItem?.name ? `${firstItem.name}${itemsList.length > 1 ? ` +${itemsList.length - 1} more` : ""}` : `${itemsList.length} item(s)`,
          status: order.status,
          total: order.total,
          createdAt: order.createdAt,
          data: { orderId: order.id, orderNumber: order.orderNumber },
        })
      }

      const savedPlans = await prisma.savedMealPlan.findMany({
        where: { userId: session.id, module: module as any, isActive: true },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: { id: true, title: true, planType: true, createdAt: true, updatedAt: true },
      })

      for (const plan of savedPlans) {
        activities.push({
          id: `plan-${plan.id}`,
          kind: "meal_plan",
          title: plan.title,
          subtitle: `${plan.planType} plan`,
          createdAt: plan.updatedAt || plan.createdAt,
          data: { planId: plan.id, planType: plan.planType },
        })
      }

      const reviews = await prisma.review.findMany({
        where: { userId: session.id, targetType: "VENDOR" },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, rating: true, comment: true, createdAt: true },
      })

      for (const review of reviews) {
        activities.push({
          id: `review-${review.id}`,
          kind: "review",
          title: `You rated ${review.rating}/5`,
          subtitle: review.comment ? review.comment.slice(0, 60) : undefined,
          createdAt: review.createdAt,
          data: { reviewId: review.id, rating: review.rating },
        })
      }
    } else {
      let vendorEntityId: string | null = null
      if (module === "FOOD") {
        const rest = await prisma.restaurant.findUnique({ where: { userId: session.id }, select: { id: true } })
        vendorEntityId = rest?.id ?? null
      } else {
        const store = await prisma.groceryStore.findUnique({ where: { userId: session.id }, select: { id: true } })
        vendorEntityId = store?.id ?? null
      }

      if (vendorEntityId) {
        const vendorOrders = await prisma.order.findMany({
          where: { vendorId: vendorEntityId, module: module as any },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true, orderNumber: true, status: true, total: true,
            createdAt: true, orderItems: true, customer: { select: { name: true } },
          },
        })

        for (const order of vendorOrders) {
          activities.push({
            id: order.id,
            kind: "order",
            title: `Order #${order.orderNumber}`,
            subtitle: order.customer?.name ? `from ${order.customer.name}` : undefined,
            status: order.status,
            total: order.total,
            
            createdAt: order.createdAt,
            data: { orderId: order.id, orderNumber: order.orderNumber },
          })
        }

        const vendorReviews = await prisma.review.findMany({
          where: { targetId: vendorEntityId, targetType: "VENDOR" },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, rating: true, comment: true, createdAt: true, user: { select: { name: true } } },
        })

        for (const r of vendorReviews) {
          activities.push({
            id: `review-${r.id}`,
            kind: "review",
            title: `${r.user?.name || "Customer"} rated ${r.rating}/5`,
            subtitle: r.comment?.slice(0, 60),
            createdAt: r.createdAt,
            data: { reviewId: r.id, rating: r.rating },
          })
        }
      }
    }

    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({ activities: activities.slice(0, limit) })
  } catch (e) {
    console.error("food-grocery-activity GET:", e)
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 })
  }
}
