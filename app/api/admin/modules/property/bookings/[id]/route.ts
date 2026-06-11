import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { formatBookingRequestRow } from "@/lib/property-types"

function mapVerification(v: {
  id: string
  complianceId: string
  documentName: string
  files: unknown
  status: string
  rejectionReason: string | null
  createdAt: Date
  updatedAt: Date
  reviewedAt: Date | null
  metadata?: unknown
  user?: { id: string; name: string | null; email: string | null; phone: string | null; avatar: string | null } | null
  reviewedBy?: { id: string; name: string | null } | null
}) {
  return {
    id: v.id,
    complianceId: v.complianceId,
    documentName: v.documentName,
    files: v.files,
    status: v.status,
    rejectionReason: v.rejectionReason,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    reviewedAt: v.reviewedAt?.toISOString() || null,
    metadata: v.metadata,
    user: v.user,
    reviewedBy: v.reviewedBy,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const booking = await prisma.propertyBooking.findUnique({
      where: { id: params.id },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
        vendor: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
        listing: {
          select: {
            id: true,
            title: true,
            city: true,
            state: true,
            address: true,
            type: true,
            images: true,
          },
        },
        approvedBy: { select: { id: true, name: true } },
        rejectedBy: { select: { id: true, name: true } },
        checkedInBy: { select: { id: true, name: true } },
        bookingVerifications: {
          include: {
            verification: {
              include: {
                user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
                reviewedBy: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const customerVerifications = await prisma.propertyGuestVerification.findMany({
      where: { userId: booking.customerId },
      include: {
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    })

    const linkedVerifications = booking.bookingVerifications.map((link) =>
      mapVerification({
        ...link.verification,
        user: link.verification.user,
        reviewedBy: link.verification.reviewedBy,
      })
    )

    const allGuestVerifications = customerVerifications.map((v) =>
      mapVerification({ ...v, user: booking.customer, reviewedBy: v.reviewedBy })
    )

    const verificationSecure =
      linkedVerifications.some((v) => v.status === "APPROVED") ||
      allGuestVerifications.some((v) => v.status === "APPROVED")

    const formatted = formatBookingRequestRow(booking)

    return NextResponse.json({
      success: true,
      booking: {
        ...formatted,
        customer: booking.customer,
        vendor: booking.vendor,
        listing: booking.listing,
        subtotal: booking.subtotal,
        cleaningFee: booking.cleaningFee,
        securityDeposit: booking.securityDeposit,
        platformFee: booking.platformFee,
        totalAmount: booking.totalAmount,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        guestIdentity: booking.guestIdentity,
        guestNotes: booking.guestNotes,
        adults: booking.adults,
        children: booking.children,
        infants: booking.infants,
        checkInISO: booking.checkIn.toISOString().slice(0, 10),
        checkOutISO: booking.checkOut.toISOString().slice(0, 10),
        escrowReleasedAt: booking.escrowReleasedAt?.toISOString() || null,
        securityDepositRefundedAt: booking.securityDepositRefundedAt?.toISOString() || null,
        checkedInAt: booking.checkedInAt?.toISOString() || null,
        checkedOutAt: booking.checkedOutAt?.toISOString() || null,
        cancelledAt: booking.cancelledAt?.toISOString() || null,
        cancelReason: booking.cancelReason,
        approvedBy: booking.approvedBy,
        rejectedBy: booking.rejectedBy,
        checkedInBy: booking.checkedInBy,
        createdAt: booking.createdAt.toISOString(),
        lifecycleLabel: formatted.displayStatus || booking.status,
        status: booking.status,
        rawStatus: booking.status,
      },
      security: {
        verificationSecure,
        linkedVerifications,
        guestVerifications: allGuestVerifications,
      },
    })
  } catch (error) {
    console.error("Admin property booking detail error:", error)
    return NextResponse.json({ error: "Failed to load booking" }, { status: 500 })
  }
}
