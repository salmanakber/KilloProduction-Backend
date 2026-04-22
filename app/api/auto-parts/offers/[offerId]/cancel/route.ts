import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { getGlobalSocketServer } from "@/lib/socket-server"

export async function POST(
  request: NextRequest,
  { params }: { params: { offerId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await request.json().catch(() => ({}))
    const reason = String(payload?.reason || "Customer cancelled offer").slice(0, 200)

    const offer = await prisma.partOffer.findUnique({
      where: { id: params.offerId },
      include: {
        request: {
          select: { id: true, userId: true, partName: true, status: true, needsMechanic: true },
        },
        vendor: { select: { id: true, name: true } },
      },
    })
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    if (offer.request.userId !== user.id) {
      return NextResponse.json({ error: "You cannot cancel this offer" }, { status: 403 })
    }
    if (["REJECTED", "WITHDRAWN", "EXPIRED"].includes(offer.status)) {
      return NextResponse.json({ error: "Offer already closed" }, { status: 400 })
    }

    if (offer.status === "ACCEPTED") {
      const paidOrder = await prisma.order.findFirst({
        where: {
          partRequestId: offer.requestId,
          paymentStatus: "PAID",
        },
        select: { id: true },
      })
      if (paidOrder) {
        return NextResponse.json(
          { error: "Offer cannot be cancelled after payment. Please contact support." },
          { status: 400 }
        )
      }
    }

    const nextStatus = offer.status === "ACCEPTED" ? "WITHDRAWN" : "REJECTED"

    const updatedOffer = await prisma.$transaction(async (tx) => {
      const updated = await tx.partOffer.update({
        where: { id: offer.id },
        data: { status: nextStatus as any },
      })

      // Keep request discoverable for remaining vendor offers.
      if (offer.request.status === "ACCEPTED") {
        await tx.partRequest.update({
          where: { id: offer.requestId },
          data: { status: "OFFERS_RECEIVED" },
        })
      }

      return updated
    })

    await NotificationBridge.sendNotification({
      userId: offer.vendorId,
      title: "Offer cancelled by customer",
      message: `${user.name || "Customer"} cancelled your offer for ${offer.request.partName}.`,
      type: "AUTO_PARTS_OFFER",
      module: "AUTO_PARTS",
      data: {
        requestId: offer.requestId,
        offerId: offer.id,
        status: nextStatus,
        reason,
      },
      actionUrl: `/vendor/auto-parts/part-offer?requestId=${encodeURIComponent(offer.requestId)}`,
    })

    try {
      getGlobalSocketServer().emitAutoPartsRequestRoom(offer.requestId, {
        type: "offer_cancelled_by_customer",
        offerId: offer.id,
        vendorId: offer.vendorId,
        status: nextStatus,
        reason,
      })
    } catch {}

    return NextResponse.json({ success: true, offer: updatedOffer })
  } catch (error) {
    console.error("Cancel part offer error:", error)
    return NextResponse.json({ error: "Failed to cancel offer" }, { status: 500 })
  }
}

