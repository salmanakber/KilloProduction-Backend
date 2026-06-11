import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [
      totalProperties,
      pendingApprovals,
      activeProperties,
      completedBookings,
      revenueAgg,
      ratingAgg,
      reservationCount,
    ] = await Promise.all([
      prisma.propertyListing.count(),
      prisma.propertyListing.count({ where: { status: "DRAFT" } }),
      prisma.propertyListing.count({ where: { status: "ACTIVE" } }),
      prisma.propertyBooking.count({ where: { status: "COMPLETED" } }),
      prisma.propertyBooking.aggregate({
        where: { status: "COMPLETED", paymentStatus: "PAID" },
        _sum: { totalAmount: true, securityDeposit: true, subtotal: true },
      }),
      prisma.propertyListing.aggregate({ _avg: { rating: true } }),
      prisma.propertyBooking.count({
        where: { status: { in: ["CONFIRMED", "CHECKED_IN", "ACTIVE", "COMPLETED"] } },
      }),
    ])

    const [settings, defaultCurrency] = await Promise.all([
      prisma.systemSettings.findUnique({
        where: { id: 1 },
        select: { defaultCurrency: true, currency: true },
      }),
      prisma.currency.findFirst({ where: { isDefault: true }, select: { symbol: true, code: true } }),
    ])
    const currencyCode = defaultCurrency?.code || settings?.defaultCurrency || settings?.currency || "NGN"
    const currencySymbol = defaultCurrency?.symbol || currencyCode
  

    return NextResponse.json({
      success: true,
      stats: {
        totalProperties,
        pendingApprovals,
        activeProperties,
        totalRevenue: revenueAgg._sum.subtotal || 0,
        totalGuestPaid: revenueAgg._sum.totalAmount || 0,
        totalSecurityDeposits: revenueAgg._sum.securityDeposit || 0,
        totalReservations: reservationCount,
        completedStays: completedBookings,
        averageRating: Math.round((ratingAgg._avg.rating || 0) * 10) / 10,
        currencyCode,
        currencySymbol,
      },
    })
  } catch (error) {
    console.error("Admin booking-properties stats error:", error)
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 })
  }
}
