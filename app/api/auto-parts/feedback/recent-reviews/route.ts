import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

/**
 * GET /api/auto-parts/feedback/recent-reviews
 * Recent AUTO_PARTS delivery reviews: default = reviews received by the current user.
 * ?orderId=... = all reviews tied to that order cluster (parent + child lines).
 * ?serviceRequestId=... = reviews with bookingID = that id (quote / mechanic job mutual ratings).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit")) || 8))
    const orderId = searchParams.get("orderId")
    const serviceRequestId = searchParams.get("serviceRequestId")

    /** Quote / mechanic jobs: reviews stored with `bookingID` = service request id (customer↔mechanic ratings). */
    if (serviceRequestId) {
      const reviews = await prisma.review.findMany({
        where: { bookingID: serviceRequestId },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          user: { select: { id: true, name: true, avatar: true } },
          target: { select: { id: true, name: true, avatar: true } },
        },
      })

      return NextResponse.json({
        reviews: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          title: r.title,
          targetType: r.targetType,
          createdAt: r.createdAt,
          from: r.user ? { id: r.user.id, name: r.user.name, avatar: r.user.avatar } : null,
          about: r.target ? { id: r.target.id, name: r.target.name, avatar: r.target.avatar } : null,
        })),
      })
    }

    if (orderId) {
      const row = await prisma.order.findFirst({
        where: { id: orderId, module: "AUTO_PARTS" },
        select: { id: true, isChildOrder: true, childId: true },
      })
      if (!row) {
        return NextResponse.json({ reviews: [] })
      }
      const parentId = row.isChildOrder && row.childId ? row.childId : row.id
      const children = await prisma.order.findMany({
        where: { childId: parentId, isChildOrder: true },
        select: { id: true },
      })
      const orderIds = [parentId, ...children.map((c) => c.id)]

      const reviews = await prisma.review.findMany({
        where: {
          orderId: { in: orderIds },
          order: { module: "AUTO_PARTS" },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          user: { select: { id: true, name: true, avatar: true } },
          target: { select: { id: true, name: true, avatar: true } },
          order: { select: { id: true, orderNumber: true } },
        },
      })

      return NextResponse.json({
        reviews: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          title: r.title,
          targetType: r.targetType,
          createdAt: r.createdAt,
          orderNumber: r.order?.orderNumber,
          orderId: r.order?.id,
          from: r.user ? { id: r.user.id, name: r.user.name, avatar: r.user.avatar } : null,
          about: r.target ? { id: r.target.id, name: r.target.name, avatar: r.target.avatar } : null,
        })),
      })
    }

    const reviews = await prisma.review.findMany({
      where: {
        targetId: user.id,
        order: { module: "AUTO_PARTS" },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    })

    return NextResponse.json({
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        title: r.title,
        targetType: r.targetType,
        createdAt: r.createdAt,
        orderNumber: r.order?.orderNumber,
        orderId: r.order?.id,
        from: r.user ? { id: r.user.id, name: r.user.name, avatar: r.user.avatar } : null,
      })),
    })
  } catch (e: unknown) {
    console.error("recent-reviews:", e)
    return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 })
  }
}
