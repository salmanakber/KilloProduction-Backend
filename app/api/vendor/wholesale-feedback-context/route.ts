import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  buildPharmacySupplierVendorFeedbackPlan,
  buildWholesalerSupplierFeedbackPlan,
  type FeedbackCardDef,
} from "@/lib/customer-feedback-plan"

const DONE = new Set(["DELIVERED", "COMPLETED"])

/**
 * GET /api/vendor/wholesale-feedback-context?bookingId=...
 * Pharmacy (supplier-order customer on booking) or linked wholesaler: rating cards after delivery.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bookingId = request.nextUrl.searchParams.get("bookingId")
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 })
    }

    const already = await prisma.review.findFirst({
      where: { userId: user.id, bookingID: bookingId },
      select: { id: true },
    })
    if (already) {
      return NextResponse.json({
        success: true,
        bookingId,
        cards: [] as FeedbackCardDef[],
        alreadySubmitted: true,
      })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
      select: { id: true, userId: true },
    })
    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
      select: { id: true, userId: true },
    })

    if (!pharmacy && !wholesaler) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (pharmacy) {
      const cb = await prisma.courierBooking.findFirst({
        where: {
          id: bookingId,
          customerId: pharmacy.userId,
          module: "WHOLESALER",
        },
        include: {
          rider: { select: { id: true, name: true } },
          supplierOrders: {
            include: {
              wholesaler: { select: { id: true, companyName: true, userId: true } },
            },
          },
        },
      })
      if (!cb) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 })
      }
      if (!DONE.has(String(cb.status))) {
        return NextResponse.json({ error: "Delivery not completed yet" }, { status: 400 })
      }
      const supplierOrders = cb.supplierOrders.map((so) => ({
        wholesaler: {
          id: so.wholesaler.id,
          companyName: so.wholesaler.companyName,
          userId: so.wholesaler.userId,
        },
      }))
      const cards: FeedbackCardDef[] = buildPharmacySupplierVendorFeedbackPlan({
        rider: cb.rider,
        supplierOrders,
      })
      return NextResponse.json({
        success: true,
        bookingId: cb.id,
        perspective: "pharmacy_vendor" as const,
        cards,
      })
    }

    const cb = await prisma.courierBooking.findFirst({
      where: {
        id: bookingId,
        module: "WHOLESALER",
        supplierOrders: { some: { wholesalerId: wholesaler!.id } },
      },
      include: {
        rider: { select: { id: true, name: true } },
        supplierOrders: {
          where: { wholesalerId: wholesaler!.id },
          take: 1,
          include: {
            pharmacy: { select: { pharmacyName: true, userId: true } },
          },
        },
      },
    })
    if (!cb) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }
    if (!DONE.has(String(cb.status))) {
      return NextResponse.json({ error: "Delivery not completed yet" }, { status: 400 })
    }
    const so = cb.supplierOrders[0]
    const pharm = so?.pharmacy
    const cards: FeedbackCardDef[] = buildWholesalerSupplierFeedbackPlan({
      rider: cb.rider,
      pharmacy: pharm
        ? { pharmacyName: pharm.pharmacyName, userId: pharm.userId }
        : null,
    })
    return NextResponse.json({
      success: true,
      bookingId: cb.id,
      perspective: "wholesaler_vendor" as const,
      cards,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load feedback context"
    console.error("wholesale-feedback-context:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
