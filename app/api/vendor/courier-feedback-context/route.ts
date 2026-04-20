import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  buildVendorStoreCourierFeedbackPlan,
  type FeedbackCardDef,
} from "@/lib/customer-feedback-plan"

/**
 * GET /api/vendor/courier-feedback-context?bookingId=...
 * Rating cards for a retail vendor (FOOD / GROCERY / PHARMACY / AUTO_PARTS) after courier delivery.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bookingId = request.nextUrl.searchParams.get("bookingId")
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 })
    }

    const courierBooking = await prisma.courierBooking.findFirst({
      where: {
        id: bookingId,
        OR: [
          { order: { vendorId: user.id } },
          { order: { childOrders: { some: { vendorId: user.id } } } },
          { order: { pharmacy: { userId: user.id } } },
          { order: { food: { userId: user.id } } },
          { order: { grocery: { userId: user.id } } },
        ],
      },
      include: {
        rider: { select: { id: true, name: true } },
      },
    })

    if (!courierBooking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    const cards: FeedbackCardDef[] = buildVendorStoreCourierFeedbackPlan({
      rider: courierBooking.rider,
    })

    if (cards.length === 0) {
      return NextResponse.json({ error: "Nothing to rate for this booking" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      bookingId: courierBooking.id,
      bookingKind: "COURIER" as const,
      courierModule: courierBooking.module,
      cards,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load feedback context"
    console.error("vendor courier-feedback-context:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
