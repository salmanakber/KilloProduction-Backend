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
    const status = (searchParams.get("status") || "ALL").toUpperCase()
    const search = (searchParams.get("search") || "").trim()

    const where: any = {}
    if (status !== "ALL") where.status = status
    if (search) {
      where.OR = [
        { documentName: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { phone: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [total, rows] = await Promise.all([
      prisma.propertyGuestVerification.count({ where }),
      prisma.propertyGuestVerification.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
          bookingLinks: {
            include: {
              booking: {
                select: {
                  id: true,
                  bookingNumber: true,
                  checkIn: true,
                  checkOut: true,
                  status: true,
                  listing: { select: { title: true, city: true } },
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
      verifications: rows.map((v) => ({
        id: v.id,
        complianceId: v.complianceId,
        documentName: v.documentName,
        files: v.files,
        status: v.status,
        rejectionReason: v.rejectionReason,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
        user: v.user,
        bookings: v.bookingLinks.map((l) => l.booking),
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    })
  } catch (error) {
    console.error("Admin guest verifications error:", error)
    return NextResponse.json({ error: "Failed to load verifications" }, { status: 500 })
  }
}
