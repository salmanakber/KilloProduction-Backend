import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const listing = await prisma.propertyListing.findUnique({
      where: { id: params.id },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isVerified: true,
            avatar: true,
            vendorProfile: { select: { businessName: true, registrationDocuments: true } },
          },
        },
      },
    })

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 })
    }

    const bookingStats = await prisma.propertyBooking.aggregate({
      where: { listingId: listing.id, paymentStatus: "PAID" },
      _count: { id: true },
      _sum: { totalAmount: true, nights: true },
    })

    return NextResponse.json({
      property: {
        id: listing.id,
        hostId: listing.vendorId,
        propertyName: listing.title,
        hostName: listing.vendor?.name || "Host",
        hostPhone: listing.vendor?.phone || "",
        hostEmail: listing.vendor?.email || "",
        address: listing.address,
        city: listing.city,
        state: listing.state,
        phone: listing.vendor?.phone || "",
        email: listing.vendor?.email || "",
        pricePerNight: listing.nightlyRate,
        maxGuests: listing.maxAdults,
        isVerified: Boolean(listing.vendor?.isVerified),
        isActive: listing.status === "ACTIVE",
        bookingType: listing.type,
        categorySlug: listing.categorySlug,
        images: listing.images,
        amenities: listing.amenities,
        registrationDocuments: listing.vendor?.vendorProfile?.registrationDocuments,
        totalNightsBooked: bookingStats._sum.nights || bookingStats._count.id,
        grossRevenue: bookingStats._sum.totalAmount || 0,
      },
    })
  } catch (error) {
    console.error("Admin booking property detail error:", error)
    return NextResponse.json({ error: "Failed to load property" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const listing = await prisma.propertyListing.findUnique({ where: { id: params.id } })
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 })
    }

    await prisma.propertyListing.update({
      where: { id: params.id },
      data: {
        title: body.propertyName ?? body.title ?? undefined,
        address: body.address ?? undefined,
        nightlyRate: body.pricePerNight != null ? Number(body.pricePerNight) : undefined,
        maxAdults: body.maxGuests != null ? Number(body.maxGuests) : undefined,
        status: body.propertyActive === false ? "INACTIVE" : body.propertyActive === true ? "ACTIVE" : undefined,
      },
    })

    if (listing.vendorId && (body.hostName || body.hostPhone || body.hostEmail || body.isVerified != null)) {
      await prisma.user.update({
        where: { id: listing.vendorId },
        data: {
          name: body.hostName ?? undefined,
          phone: body.hostPhone ?? body.phone ?? undefined,
          email: body.hostEmail ?? body.email ?? undefined,
          isVerified: body.isVerified ?? undefined,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Admin booking property update error:", error)
    return NextResponse.json({ error: "Failed to update property" }, { status: 500 })
  }
}
