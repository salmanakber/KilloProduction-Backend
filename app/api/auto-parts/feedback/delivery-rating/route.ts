import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import type { ReviewTarget } from "@prisma/client"

/** Resolve mechanic service request when mobile queue omitted serviceRequestId */
async function resolveMechanicServiceRequestIdForOrder(params: {
  parentOrderId: string
  customerId: string
  mechanicUserId: string
}): Promise<string | null> {
  const mech = await prisma.mechanicProfile.findUnique({
    where: { userId: params.mechanicUserId },
    select: { id: true },
  })
  if (!mech) return null
  const children = await prisma.order.findMany({
    where: { childId: params.parentOrderId, isChildOrder: true },
    select: { id: true },
  })
  const orderIds = [params.parentOrderId, ...children.map((c) => c.id)]
  const sr = await prisma.mechanicServiceRequest.findFirst({
    where: {
      customerId: params.customerId,
      mechanicId: mech.id,
      OR: orderIds.map((oid) => ({
        metadata: { path: ["orderId"], equals: oid } as any,
      })),
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  })
  return sr?.id ?? null
}

async function updateMechanicUserRating(mechanicUserId: string) {
  const reviews = await prisma.review.findMany({
    where: { targetId: mechanicUserId, targetType: "MECHANIC" },
  })
  if (reviews.length === 0) {
    try {
      await prisma.mechanicProfile.update({
        where: { userId: mechanicUserId },
        data: { rating: 0, totalReviews: 0 },
      })
    } catch {
      /* no profile */
    }
    return
  }
  const averageRating = reviews.reduce((sum, x) => sum + x.rating, 0) / reviews.length
  try {
    await prisma.mechanicProfile.update({
      where: { userId: mechanicUserId },
      data: { rating: averageRating, totalReviews: reviews.length },
    })
  } catch {
    /* profile may not exist for edge accounts */
  }
}

async function updateAutoPartsStoreRating(vendorUserId: string) {
  const reviews = await prisma.review.findMany({
    where: { targetId: vendorUserId, targetType: "VENDOR" },
    select: { rating: true },
  })
  const averageRating =
    reviews.length > 0 ? reviews.reduce((sum, x) => sum + x.rating, 0) / reviews.length : 0
  try {
    await prisma.autoPartsStore.update({
      where: { userId: vendorUserId },
      data: { rating: averageRating, totalReviews: reviews.length },
    })
  } catch {
    /* vendor may not have an auto-parts store row */
  }
}

async function updateCustomerTargetAggregate(customerUserId: string) {
  const reviews = await prisma.review.findMany({
    where: { targetId: customerUserId, targetType: "CUSTOMER" },
    select: { rating: true },
  })
  const averageRating =
    reviews.length > 0 ? reviews.reduce((sum, x) => sum + x.rating, 0) / reviews.length : 0
  try {
    await prisma.user.update({
      where: { id: customerUserId },
      data: {
        customerTargetRating: averageRating,
        customerTargetReviewCount: reviews.length,
      },
    })
  } catch {
    /* user missing */
  }
}

/**
 * POST /api/auto-parts/feedback/delivery-rating
 * After delivery QR: mechanic → rate customer; customer → rate mechanic + vendor(s); vendor → rate customer only.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const parentOrderId = typeof body.parentOrderId === "string" ? body.parentOrderId : ""
    const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : ""
    const targetType = String(body.targetType || "").toUpperCase()
    const rating = Number(body.rating)
    const title = typeof body.title === "string" ? body.title : null
    const comment = typeof body.comment === "string" ? body.comment : null
    const serviceRequestId = typeof body.serviceRequestId === "string" ? body.serviceRequestId : ""

    if (!parentOrderId) {
      return NextResponse.json({ error: "parentOrderId is required" }, { status: 400 })
    }
    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId is required" }, { status: 400 })
    }
    if (!["MECHANIC", "VENDOR", "CUSTOMER"].includes(targetType)) {
      return NextResponse.json({ error: "targetType must be MECHANIC, VENDOR, or CUSTOMER" }, { status: 400 })
    }
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 })
    }

    /**
     * Quote / ONLY_SERVICE jobs use synthetic `ap-sr:<mechanicServiceRequestId>` — no parent Order row.
     * Part-request + vendor + order flows keep using real `parentOrderId` (unchanged below).
     */
    if (parentOrderId.startsWith("ap-sr:")) {
      const srId = parentOrderId.slice("ap-sr:".length)
      if (!srId) {
        return NextResponse.json({ error: "Invalid synthetic job id" }, { status: 400 })
      }

      if (user.role === "MECHANIC" && targetType === "CUSTOMER") {
        const sr = await prisma.mechanicServiceRequest.findUnique({
          where: { id: srId },
          include: {
            mechanic: { include: { user: { select: { id: true } } } },
          },
        })
        if (!sr) {
          return NextResponse.json({ error: "Service request not found" }, { status: 404 })
        }
        if (targetUserId !== sr.customerId) {
          return NextResponse.json({ error: "Invalid customer for this job" }, { status: 400 })
        }

        let mechanicUserId: string | null = sr.mechanic?.user?.id ?? null
        if (!mechanicUserId) {
          const fromQuote = await prisma.mechanicQuote.findFirst({
            where: { serviceRequestId: sr.id },
            select: { mechanicId: true },
          })
          mechanicUserId = fromQuote?.mechanicId ?? null
        }
        if (!mechanicUserId) {
          const fromOffer = await prisma.mechanicOffer.findFirst({
            where: { serviceRequestId: sr.id, status: "ACCEPTED" },
            select: { mechanicId: true },
          })
          mechanicUserId = fromOffer?.mechanicId ?? null
        }
        if (!mechanicUserId) {
          const anyOffer = await prisma.mechanicOffer.findFirst({
            where: { serviceRequestId: sr.id },
            orderBy: { updatedAt: "desc" },
            select: { mechanicId: true },
          })
          mechanicUserId = anyOffer?.mechanicId ?? null
        }

        if (!mechanicUserId || mechanicUserId !== user.id) {
          return NextResponse.json({ error: "You are not the assigned mechanic for this job" }, { status: 403 })
        }

        const existing = await prisma.review.findFirst({
          where: {
            userId: user.id,
            targetId: targetUserId,
            targetType: "CUSTOMER",
            bookingID: sr.id,
          },
        })
        const data = { rating, title: title || null, comment: comment || null, updatedAt: new Date() }
        const review = existing
          ? await prisma.review.update({ where: { id: existing.id }, data })
          : await prisma.review.create({
              data: {
                userId: user.id,
                targetId: targetUserId,
                targetType: "CUSTOMER",
                bookingID: sr.id,
                rating,
                title: title || null,
                comment: comment || null,
              },
            })

        await updateCustomerTargetAggregate(targetUserId)
        return NextResponse.json({ success: true, review })
      }

      return NextResponse.json(
        { error: "This feedback type requires a delivered auto-parts order" },
        { status: 400 }
      )
    }

    const parent = await prisma.order.findFirst({
      where: { id: parentOrderId, module: "AUTO_PARTS", isChildOrder: false },
      select: {
        id: true,
        customerId: true,
        status: true,
        metadata: true,
        vendorId: true,
      },
    })

    if (!parent) {
      return NextResponse.json({ error: "Parent auto-parts order not found" }, { status: 404 })
    }
    if (parent.status !== "DELIVERED") {
      return NextResponse.json({ error: "Order must be delivered before leaving this feedback" }, { status: 400 })
    }

    const pmeta = (parent.metadata as Record<string, unknown>) || {}
    const mechanicOnParent = (pmeta.mechanicId as string) || ""

    const tt = targetType as ReviewTarget

    // ── Mechanic rates customer ─────────────────────────────────────────────
    if (user.role === "MECHANIC" && tt === "CUSTOMER") {
      if (mechanicOnParent !== user.id) {
        return NextResponse.json({ error: "You are not the assigned mechanic for this order" }, { status: 403 })
      }
      if (targetUserId !== parent.customerId) {
        return NextResponse.json({ error: "Invalid customer for this order" }, { status: 400 })
      }

      const existing = await prisma.review.findFirst({
        where: {
          userId: user.id,
          targetId: targetUserId,
          targetType: "CUSTOMER",
          orderId: parent.id,
        },
      })
      const data = { rating, title: title || null, comment: comment || null, updatedAt: new Date() }
      const review = existing
        ? await prisma.review.update({ where: { id: existing.id }, data })
        : await prisma.review.create({
            data: {
              userId: user.id,
              targetId: targetUserId,
              targetType: "CUSTOMER",
              orderId: parent.id,
              rating,
              title: title || null,
              comment: comment || null,
            },
          })

      await updateCustomerTargetAggregate(targetUserId)
      return NextResponse.json({ success: true, review })
    }

    // ── Customer rates mechanic ───────────────────────────────────────────────
    if (user.role === "CUSTOMER" && tt === "MECHANIC") {
      if (parent.customerId !== user.id) {
        return NextResponse.json({ error: "Not your order" }, { status: 403 })
      }
      if (!mechanicOnParent || targetUserId !== mechanicOnParent) {
        return NextResponse.json({ error: "That mechanic is not assigned to this order" }, { status: 400 })
      }

      let resolvedSrId = serviceRequestId
      if (!resolvedSrId) {
        resolvedSrId =
          (await resolveMechanicServiceRequestIdForOrder({
            parentOrderId: parent.id,
            customerId: user.id,
            mechanicUserId: targetUserId,
          })) || ""
      }
      if (!resolvedSrId) {
        return NextResponse.json({ error: "serviceRequestId is required" }, { status: 400 })
      }

      const sr = await prisma.mechanicServiceRequest.findUnique({
        where: { id: resolvedSrId },
        include: { mechanic: { include: { user: true } } },
      })
      if (!sr || sr.customerId !== user.id) {
        return NextResponse.json({ error: "Service request not found" }, { status: 404 })
      }
      const muid = sr.mechanic?.userId
      if (!muid || muid !== targetUserId) {
        return NextResponse.json({ error: "Mechanic does not match this job" }, { status: 400 })
      }

      const existing = await prisma.review.findFirst({
        where: {
          userId: user.id,
          targetId: targetUserId,
          targetType: "MECHANIC",
          bookingID: resolvedSrId,
        },
      })
      const review = existing
        ? await prisma.review.update({
            where: { id: existing.id },
            data: { rating, title: title || null, comment: comment || null, updatedAt: new Date() },
          })
        : await prisma.review.create({
            data: {
              userId: user.id,
              targetId: targetUserId,
              targetType: "MECHANIC",
              ...(sr.mechanicId ? { mechanicId: sr.mechanicId } : {}),
              bookingID: resolvedSrId,
              rating,
              title: title || null,
              comment: comment || null,
            },
          })

      await updateMechanicUserRating(targetUserId)
      return NextResponse.json({ success: true, review })
    }

    // ── Customer rates vendor ─────────────────────────────────────────────────
    if (user.role === "CUSTOMER" && tt === "VENDOR") {
      if (parent.customerId !== user.id) {
        return NextResponse.json({ error: "Not your order" }, { status: 403 })
      }
      const line = await prisma.order.findFirst({
        where: {
          module: "AUTO_PARTS",
          customerId: user.id,
          OR: [
            { id: parent.id, vendorId: targetUserId },
            { isChildOrder: true, childId: parent.id, vendorId: targetUserId },
          ],
        },
        select: { id: true },
      })
      if (!line) {
        return NextResponse.json({ error: "That vendor is not on this order" }, { status: 400 })
      }

      const existing = await prisma.review.findFirst({
        where: {
          userId: user.id,
          targetId: targetUserId,
          targetType: "VENDOR",
          orderId: line.id,
        },
      })
      const review = existing
        ? await prisma.review.update({
            where: { id: existing.id },
            data: { rating, title: title || null, comment: comment || null, updatedAt: new Date() },
          })
        : await prisma.review.create({
            data: {
              userId: user.id,
              targetId: targetUserId,
              targetType: "VENDOR",
              orderId: line.id,
              rating,
              title: title || null,
              comment: comment || null,
            },
          })

      await updateAutoPartsStoreRating(targetUserId)
      return NextResponse.json({ success: true, review })
    }

    // ── Vendor rates customer ─────────────────────────────────────────────────
    if (user.role === "VENDOR" && tt === "CUSTOMER") {
      const line = await prisma.order.findFirst({
        where: {
          module: "AUTO_PARTS",
          vendorId: user.id,
          OR: [
            { id: parent.id, customerId: targetUserId },
            { isChildOrder: true, childId: parent.id, customerId: targetUserId },
          ],
        },
        select: { id: true },
      })
      if (!line) {
        return NextResponse.json({ error: "You are not the vendor on this order line" }, { status: 403 })
      }

      const existing = await prisma.review.findFirst({
        where: {
          userId: user.id,
          targetId: targetUserId,
          targetType: "CUSTOMER",
          orderId: line.id,
        },
      })
      const review = existing
        ? await prisma.review.update({
            where: { id: existing.id },
            data: { rating, title: title || null, comment: comment || null, updatedAt: new Date() },
          })
        : await prisma.review.create({
            data: {
              userId: user.id,
              targetId: targetUserId,
              targetType: "CUSTOMER",
              orderId: line.id,
              rating,
              title: title || null,
              comment: comment || null,
            },
          })

      await updateCustomerTargetAggregate(targetUserId)
      return NextResponse.json({ success: true, review })
    }

    return NextResponse.json({ error: "This rating is not allowed for your role" }, { status: 403 })
  } catch (e: unknown) {
    console.error("delivery-rating:", e)
    const msg = e instanceof Error ? e.message : "Failed to submit rating"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
