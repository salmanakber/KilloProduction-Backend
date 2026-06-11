import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await prisma.user.findUnique({ where: { id: session.id } })
    if (admin?.role !== "ADMIN" && admin?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get("page") || 1))
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)))
    const skip = (page - 1) * limit

    const where = { isCommissionLocked: true }

    const [rows, total] = await Promise.all([
      prisma.riderProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { commissionLockedAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              avatar: true,
              isActive: true,
            },
          },
        },
      }),
      prisma.riderProfile.count({ where }),
    ])

    const riderIds = rows.map((r) => r.userId)
    const payables =
      riderIds.length > 0
        ? await prisma.riderPayableCommission.findMany({
            where: {
              riderId: { in: riderIds },
              status: { in: ["PENDING", "LOCKED"] },
            },
            select: {
              riderId: true,
              commissionAmount: true,
              status: true,
              dueAt: true,
              rideBooking: { select: { bookingNumber: true } },
            },
          })
        : []

    const payableByRider = new Map<string, typeof payables>()
    for (const p of payables) {
      const list = payableByRider.get(p.riderId) || []
      list.push(p)
      payableByRider.set(p.riderId, list)
    }

    return NextResponse.json({
      success: true,
      data: rows.map((profile) => {
        const items = payableByRider.get(profile.userId) || []
        const totalOwed = items.reduce((s, i) => s + (i.commissionAmount || 0), 0)
        return {
          riderId: profile.userId,
          user: profile.user,
          vehicleType: profile.vehicleType,
          licensePlate: profile.licensePlate,
          commissionLockedAt: profile.commissionLockedAt?.toISOString() ?? null,
          commissionLockReason: profile.commissionLockReason,
          totalOwed: Math.round(totalOwed * 100) / 100,
          outstandingItems: items.map((i) => ({
            amount: i.commissionAmount,
            status: i.status,
            dueAt: i.dueAt.toISOString(),
            bookingNumber: i.rideBooking?.bookingNumber,
          })),
        }
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[admin locked riders]", error)
    return NextResponse.json({ error: "Failed to load locked riders" }, { status: 500 })
  }
}
