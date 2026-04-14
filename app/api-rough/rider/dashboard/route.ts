import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rider = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        riderProfile: true,
      },
    })

    if (!rider || rider.role !== "RIDER") {
      return NextResponse.json({ error: "Not a rider" }, { status: 403 })
    }

    // Get time ranges
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    // Get analytics data
    const [
      todayRides,
      weekRides,
      monthRides,
      todayEarnings,
      weekEarnings,
      monthEarnings,
      activeRides,
      pendingRides,
      recentRides,
      totalRating,
      pendingCashout,
    ] = await Promise.all([
      // Today's rides
      prisma.rideBooking.count({
        where: {
          riderId: session.user.id,
          status: "COMPLETED",
          completedAt: { gte: startOfDay },
        },
      }),
      // Week rides
      prisma.rideBooking.count({
        where: {
          riderId: session.user.id,
          status: "COMPLETED",
          completedAt: { gte: startOfWeek },
        },
      }),
      // Month rides
      prisma.rideBooking.count({
        where: {
          riderId: session.user.id,
          status: "COMPLETED",
          completedAt: { gte: startOfMonth },
        },
      }),
      // Today's earnings
      prisma.rideBooking.aggregate({
        where: {
          riderId: session.user.id,
          status: "COMPLETED",
          completedAt: { gte: startOfDay },
        },
        _sum: { finalFare: true },
      }),
      // Week earnings
      prisma.rideBooking.aggregate({
        where: {
          riderId: session.user.id,
          status: "COMPLETED",
          completedAt: { gte: startOfWeek },
        },
        _sum: { finalFare: true },
      }),
      // Month earnings
      prisma.rideBooking.aggregate({
        where: {
          riderId: session.user.id,
          status: "COMPLETED",
          completedAt: { gte: startOfMonth },
        },
        _sum: { finalFare: true },
      }),
      // Active rides
      prisma.rideBooking.count({
        where: {
          riderId: session.user.id,
          status: { in: ["ACCEPTED", "ARRIVING", "ARRIVED", "PICKED_UP", "IN_TRANSIT"] },
        },
      }),
      // Pending rides (available to accept)
      prisma.rideBooking.count({
        where: {
          riderId: null,
          status: { in: ["REQUESTED", "BIDDING"] },
        },
      }),
      // Recent rides
      prisma.rideBooking.findMany({
        where: { riderId: session.user.id },
        include: {
          customer: {
            select: { name: true, phone: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // Average rating
      prisma.rideBooking.aggregate({
        where: {
          riderId: session.user.id,
          riderRating: { not: null },
        },
        _avg: { riderRating: true },
      }),
      // Pending cashout amount
      prisma.riderCashout.aggregate({
        where: {
          riderId: session.user.id,
          status: { in: ["PENDING", "PROCESSING"] },
        },
        _sum: { amount: true },
      }),
    ])

    const analytics = {
      todayRides,
      weekRides,
      monthRides,
      todayEarnings: todayEarnings._sum.finalFare || 0,
      weekEarnings: weekEarnings._sum.finalFare || 0,
      monthEarnings: monthEarnings._sum.finalFare || 0,
      activeRides,
      pendingRides,
      averageRating: totalRating._avg.riderRating || 0,
      onlineHours: 8, // TODO: Calculate actual online hours
    }

    return NextResponse.json({
      rider,
      analytics,
      recentRides,
      pendingCashout: pendingCashout._sum.amount || 0,
    })
  } catch (error) {
    console.error("Error fetching rider dashboard:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
