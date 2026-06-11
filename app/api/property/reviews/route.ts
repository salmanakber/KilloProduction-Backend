import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { bookingId, rating, comment, photos } = await request.json()
    if (!bookingId || !rating) {
      return NextResponse.json({ error: "bookingId and rating required" }, { status: 400 })
    }

    const booking = await prisma.propertyBooking.findUnique({ where: { id: bookingId } })
    if (!booking || booking.customerId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (booking.status !== "COMPLETED") {
      return NextResponse.json({ error: "Booking must be completed before review" }, { status: 400 })
    }

    const existing = await prisma.propertyReview.findUnique({ where: { bookingId } })
    if (existing) {
      return NextResponse.json({ error: "You already reviewed this stay" }, { status: 409 })
    }

    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.propertyReview.create({
        data: {
          bookingId,
          listingId: booking.listingId,
          customerId: user.id,
          rating: Math.min(5, Math.max(1, Number(rating))),
          comment: comment || null,
          photos: photos || [],
        },
      })

      const agg = await tx.propertyReview.aggregate({
        where: { listingId: booking.listingId },
        _avg: { rating: true },
        _count: true,
      })

      await tx.propertyListing.update({
        where: { id: booking.listingId },
        data: {
          rating: agg._avg.rating || 0,
          reviewCount: agg._count,
        },
      })

      return created
    })

    const { NotificationBridge } = await import("@/lib/notification-bridge")
    await NotificationBridge.sendNotification({
      userId: booking.vendorId,
      title: "New review",
      message: "A guest left a review on your property.",
      type: "REVIEW_RECEIVED",
      module: "PROPERTY",
      data: { propertyBookingId: bookingId, listingId: booking.listingId },
    })

    return NextResponse.json({ success: true, review }, { status: 201 })
  } catch (error) {
    console.error("Property review POST error:", error)
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 })
  }
}
