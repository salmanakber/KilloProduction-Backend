import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { calculatePropertyQuote } from "@/lib/property-pricing"
import {
  assertListingAvailable,
  generatePropertyBookingNumber,
} from "@/lib/property-booking-service"
import { formatBookingRequestRow } from "@/lib/property-types"
import { normalizePropertyGuestTier } from "@/lib/property-guest-tier"
import { resolvePropertyHostVendorId } from "@/lib/property-host-resolve"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const role = searchParams.get("role")

    const where: any = {}
    if (user.role === "CUSTOMER" || role === "customer") {
      where.customerId = user.id
    } else if (user.role === "VENDOR" || role === "vendor") {
      const hostVendorId = await resolvePropertyHostVendorId(user.id)
      if (!hostVendorId) {
        return NextResponse.json({ error: "Not a property host account" }, { status: 403 })
      }
      where.vendorId = hostVendorId
      where.status = { not: "PENDING_PAYMENT" }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (status) {
      const statuses = status.split(",").map((s) => s.trim().toUpperCase())
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0]
    }

    const bookings = await prisma.propertyBooking.findMany({
      where,
      include: {
        listing: {
          include: { vendor: { select: { id: true, name: true, avatar: true } } },
        },
        customer: { select: { id: true, name: true, avatar: true, phone: true } },
        vendor: { select: { id: true, name: true, avatar: true, phone: true } },
        approvedBy: { select: { id: true, name: true, avatar: true } },
        rejectedBy: { select: { id: true, name: true, avatar: true } },
        checkedInBy: { select: { id: true, name: true, avatar: true } },
        checkedOutBy: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    const isCustomerList = user.role === "CUSTOMER" || role === "customer"
    const reviewMap = new Map<string, { id: string; rating: number; comment: string | null }>()
    if (isCustomerList && bookings.length > 0) {
      const reviews = await prisma.propertyReview.findMany({
        where: {
          bookingId: { in: bookings.map((b) => b.id) },
          customerId: user.id,
        },
        select: { id: true, bookingId: true, rating: true, comment: true },
      })
      for (const r of reviews) {
        reviewMap.set(r.bookingId, { id: r.id, rating: r.rating, comment: r.comment })
      }
    }

    return NextResponse.json({
      success: true,
      bookings: bookings.map((b) => {
        const review = reviewMap.get(b.id)
        return {
          ...formatBookingRequestRow(b),
          hasReview: Boolean(review),
          review: review || null,
          listing: b.listing
            ? {
                id: b.listing.id,
                title: b.listing.title,
                city: b.listing.city,
                image: (b.listing.images as string[])?.[0],
              }
            : null,
          vendor: b.vendor
            ? { id: b.vendor.id, name: b.vendor.name, avatar: b.vendor.avatar }
            : null,
        }
      }),
    })
  } catch (error) {
    console.error("Property bookings GET error:", error)
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      listingId,
      checkIn,
      checkOut,
      adults = 1,
      children = 0,
      infants = 0,
      guestNotes,
      guestIdentity,
    } = body

    if (!listingId || !checkIn || !checkOut) {
      return NextResponse.json(
        { error: "listingId, checkIn, and checkOut are required" },
        { status: 400 }
      )
    }

    const listing = await prisma.propertyListing.findUnique({ where: { id: listingId } })
    if (!listing || listing.status !== "ACTIVE") {
      return NextResponse.json({ error: "Listing not available" }, { status: 404 })
    }

    const checkInDate = new Date(checkIn)
    const checkOutDate = new Date(checkOut)
    const nights = Math.max(
      1,
      Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000)
    )

    await assertListingAvailable(listingId, checkInDate, checkOutDate)

    const adultCount = Math.max(1, Number(adults))
    const childCount = Math.max(0, Number(children))
    const infantCount = Math.max(0, Number(infants))
    const guestTotal = adultCount + childCount
    const maxGuests = (listing.maxAdults ?? 2) + (listing.maxChildren ?? 0)
    if (adultCount > (listing.maxAdults ?? 2)) {
      return NextResponse.json(
        { error: `This property allows up to ${listing.maxAdults ?? 2} adults` },
        { status: 400 }
      )
    }
    if (childCount > (listing.maxChildren ?? 0)) {
      return NextResponse.json(
        { error: `This property allows up to ${listing.maxChildren ?? 0} children` },
        { status: 400 }
      )
    }
    if (guestTotal > maxGuests) {
      return NextResponse.json(
        { error: `Maximum ${maxGuests} guests allowed (excluding infants)` },
        { status: 400 }
      )
    }

    const { assertGuestComplianceForBooking, linkVerificationsToBooking } = await import(
      "@/lib/property-guest-compliance"
    )
    let verificationIds: string[] = []
    try {
      verificationIds = await assertGuestComplianceForBooking(user.id)
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Guest verification required" }, { status: 403 })
    }

    const quote = await calculatePropertyQuote({
      nightlyRate: listing.nightlyRate,
      discountPercent: listing.discountPercent,
      cleaningFee: listing.cleaningFee,
      securityDeposit: listing.securityDeposit,
      nights,
    })

    const booking = await prisma.propertyBooking.create({
      data: {
        bookingNumber: generatePropertyBookingNumber(),
        listingId,
        customerId: user.id,
        vendorId: listing.vendorId,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        nights: quote.nights,
        adults: adultCount,
        children: childCount,
        infants: infantCount,
        guestNotes: guestNotes || null,
        guestIdentity: guestIdentity || null,
        guestTier: normalizePropertyGuestTier(listing.guestTier),
        subtotal: quote.subtotal,
        cleaningFee: quote.cleaningFee,
        securityDeposit: quote.securityDeposit,
        platformFee: quote.platformFee,
        totalAmount: quote.totalAmount,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
      },
      include: {
        listing: true,
      },
    })

    await linkVerificationsToBooking(booking.id, verificationIds)

    return NextResponse.json(
      {
        success: true,
        booking,
        quote,
        payment: {
          orderId: `property-${booking.id}`,
          amount: quote.totalAmount,
          module: "PROPERTY",
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create booking" },
      { status: 400 }
    )
  }
}
