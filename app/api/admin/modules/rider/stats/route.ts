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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const [totalRiders, activeRiders, pendingApprovals, totalEarnings, averageRating, completionRate] =
      await Promise.all([
        // Total riders
        prisma.user.count({
          where: {
            role: "RIDER",
            riderProfile: { isNot: null },
          },
        }),

        // Active riders (online)
        prisma.user.count({
          where: {
            role: "RIDER",
            riderProfile: {
              isOnline: true,
              isApproved: true,
            },
          },
        }),

        // Pending approvals
        prisma.user.count({
          where: {
            role: "RIDER",
            riderProfile: {
              isApproved: false,
              isVerified: true,
            },
          },
        }),

        // Total earnings this month
        prisma.riderEarning.aggregate({
          _sum: { amount: true },
          where: {
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),

        // Average rating
        prisma.riderProfile.aggregate({
          _avg: { rating: true },
          where: {
            isApproved: true,
          },
        }),

        // Completion rate (you'd need to calculate this based on your business logic)
        prisma.rideBooking.aggregate({
          _count: {
            id: true,
          },
          where: {
            status: "COMPLETED",
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
      ])

    const stats = {
      totalRiders,
      activeRiders,
      pendingApprovals,
      totalEarnings: totalEarnings._sum.amount || 0,
      averageRating: averageRating._avg.rating || 0,
      completionRate: 85, // This would be calculated based on your business logic
    }

    return NextResponse.json({ stats })
  } catch (error) {
    console.error("Error fetching rider stats:", error)
    return NextResponse.json({ error: "Failed to fetch rider stats" }, { status: 500 })
  }
}
