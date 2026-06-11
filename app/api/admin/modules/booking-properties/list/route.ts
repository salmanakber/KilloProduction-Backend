import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get("page") || 1))
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)))
    const search = (searchParams.get("search") || "").trim()
    const status = (searchParams.get("status") || "ALL").toUpperCase()

    const where: any = {}
    if (status === "PENDING") where.status = "DRAFT"
    else if (status === "APPROVED") where.status = "ACTIVE"
    else if (status === "REJECTED" || status === "SUSPENDED") where.status = "INACTIVE"
    else if (status !== "ALL") where.status = status

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [total, listings] = await Promise.all([
      prisma.propertyListing.count({ where }),
      prisma.propertyListing.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true, email: true, phone: true, isVerified: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const listingIds = listings.map((l) => l.id)
    const bookingStats =
      listingIds.length > 0
        ? await prisma.propertyBooking.groupBy({
            by: ["listingId"],
            where: { listingId: { in: listingIds }, status: { in: ["COMPLETED", "CHECKED_IN", "CONFIRMED", "ACTIVE"] } },
            _count: { id: true },
            _sum: { totalAmount: true },
          })
        : []
    const statsMap = new Map(
      bookingStats.map((g) => [g.listingId, { nights: g._count.id, revenue: g._sum.totalAmount || 0 }])
    )

    const properties = listings.map((l) => {
      const st = statsMap.get(l.id)
      const statusLabel =
        l.status === "ACTIVE" ? "APPROVED" : l.status === "DRAFT" ? "PENDING" : l.status === "INACTIVE" ? "SUSPENDED" : l.status
      return {
        id: l.id,
        hostId: l.vendorId,
        propertyName: l.title,
        hostName: l.vendor?.name || "Host",
        email: l.vendor?.email || "",
        phone: l.vendor?.phone || "",
        address: l.address,
        city: l.city,
        bookingType: l.type,
        categorySlug: l.categorySlug,
        permitNumber: "",
        status: statusLabel,
        isVerified: Boolean(l.vendor?.isVerified),
        registrationDate: l.createdAt.toISOString(),
        totalNightsBooked: st?.nights || 0,
        grossRevenue: st?.revenue || 0,
        rating: l.rating,
        maxGuests: l.maxGuests,
        pricePerNight: l.nightlyRate,
        amenities: Array.isArray(l.amenities) ? l.amenities : [],
        documents: {},
      }
    })

    return NextResponse.json({
      success: true,
      properties,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    })
  } catch (error) {
    console.error("Admin booking-properties list error:", error)
    return NextResponse.json({ error: "Failed to load properties" }, { status: 500 })
  }
}
