import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { formatBookingRequestRow } from "@/lib/property-types"

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
    const status = (searchParams.get("status") || "").trim().toUpperCase()
    const city = (searchParams.get("city") || "").trim()
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const where: any = {}
    if (status && status !== "ALL") where.status = status
    if (city) where.listing = { city: { contains: city, mode: "insensitive" } }
    if (from || to) {
      where.checkIn = {}
      if (from) where.checkIn.gte = new Date(from)
      if (to) where.checkIn.lte = new Date(to)
    }
    if (search) {
      where.OR = [
        { bookingNumber: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
        { listing: { title: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [total, rows] = await Promise.all([
      prisma.propertyBooking.count({ where }),
      prisma.propertyBooking.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
          vendor: { select: { id: true, name: true, email: true, phone: true } },
          listing: { select: { id: true, title: true, city: true, state: true, type: true } },
          bookingVerifications: {
            include: {
              verification: {
                select: {
                  id: true,
                  documentName: true,
                  status: true,
                  files: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return NextResponse.json({
      success: true,
      bookings: rows.map((b) => {
        const formatted = formatBookingRequestRow(b)
        return {
        ...formatted,
        lifecycleLabel: formatted.displayStatus || b.status,
        customer: b.customer,
        vendor: b.vendor,
        listing: b.listing,
        subtotal: b.subtotal,
        cleaningFee: b.cleaningFee,
        securityDeposit: b.securityDeposit,
        platformFee: b.platformFee,
        totalAmount: b.totalAmount,
        paymentStatus: b.paymentStatus,
        checkInISO: b.checkIn.toISOString().slice(0, 10),
        checkOutISO: b.checkOut.toISOString().slice(0, 10),
        escrowReleasedAt: b.escrowReleasedAt?.toISOString() || null,
        securityDepositRefundedAt: b.securityDepositRefundedAt?.toISOString() || null,
        guestVerifications: b.bookingVerifications.map((link) => ({
          id: link.verification.id,
          documentName: link.verification.documentName,
          status: link.verification.status,
          files: link.verification.files,
          createdAt: link.verification.createdAt.toISOString(),
        })),
        verificationStatus: b.bookingVerifications.some((l) => l.verification.status === "APPROVED")
          ? "APPROVED"
          : b.bookingVerifications.some((l) => l.verification.status === "SUBMITTED")
            ? "SUBMITTED"
            : b.bookingVerifications.length > 0
              ? b.bookingVerifications[0].verification.status
              : "NONE",
      }}),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch (error) {
    console.error("Admin property bookings error:", error)
    return NextResponse.json({ error: "Failed to load bookings" }, { status: 500 })
  }
}
