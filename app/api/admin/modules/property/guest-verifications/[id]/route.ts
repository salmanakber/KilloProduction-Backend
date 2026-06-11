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

    const row = await prisma.propertyGuestVerification.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        bookingLinks: {
          include: {
            booking: {
              select: {
                id: true,
                bookingNumber: true,
                status: true,
                checkIn: true,
                checkOut: true,
                totalAmount: true,
                listing: { select: { title: true, city: true } },
                customer: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    })

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      verification: {
        id: row.id,
        complianceId: row.complianceId,
        documentName: row.documentName,
        files: row.files,
        status: row.status,
        rejectionReason: row.rejectionReason,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() || null,
        user: row.user,
        reviewedBy: row.reviewedBy,
        bookings: row.bookingLinks.map((l) => ({
          ...l.booking,
          checkInISO: l.booking.checkIn.toISOString().slice(0, 10),
          checkOutISO: l.booking.checkOut.toISOString().slice(0, 10),
        })),
      },
    })
  } catch (error) {
    console.error("Guest verification detail error:", error)
    return NextResponse.json({ error: "Failed to load verification" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await authenticateRequest(request)
    if (!admin || !["ADMIN", "SUPER_ADMIN"].includes(admin.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action, reason } = await request.json()
    const row = await prisma.propertyGuestVerification.findUnique({ where: { id: params.id } })
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (action === "approve") {
      const updated = await prisma.propertyGuestVerification.update({
        where: { id: params.id },
        data: {
          status: "APPROVED",
          reviewedById: admin.id,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      })
      return NextResponse.json({ success: true, verification: updated })
    }

    if (action === "reject") {
      const updated = await prisma.propertyGuestVerification.update({
        where: { id: params.id },
        data: {
          status: "REJECTED",
          reviewedById: admin.id,
          reviewedAt: new Date(),
          rejectionReason: reason || "Rejected by admin",
        },
      })
      return NextResponse.json({ success: true, verification: updated })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Guest verification review error:", error)
    return NextResponse.json({ error: "Failed to update verification" }, { status: 500 })
  }
}
