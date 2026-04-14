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

    // Get HR statistics
    const [totalStaff, activeStaff, onLeave, pendingLeaveRequests, totalTicketsResolved, averageResponseTime] =
      await Promise.all([
        prisma.user.count({
          where: {
            role: { in: ["ADMIN", "SUPPORT", "OPERATIONS", "MARKETING", "FINANCE"] },
          },
        }),
        prisma.user.count({
          where: {
            role: { in: ["ADMIN", "SUPPORT", "OPERATIONS", "MARKETING", "FINANCE"] },
            isActive: true,
          },
        }),
        prisma.staffLeaveRequest.count({
          where: {
            status: "APPROVED",
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
          },
        }),
        prisma.staffLeaveRequest.count({
          where: { status: "PENDING" },
        }),
        prisma.supportTicket.count({
          where: { status: "RESOLVED" },
        }),
        prisma.supportTicket.aggregate({
          where: { status: "RESOLVED" },
          _avg: { responseTimeMinutes: true },
        }),
      ])

    const stats = {
      totalStaff,
      activeStaff,
      onLeave,
      pendingLeaveRequests,
      averageResponseTime: Math.round(averageResponseTime._avg.responseTimeMinutes || 0),
      totalTicketsResolved,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("Error fetching HR stats:", error)
    return NextResponse.json({ error: "Failed to fetch HR stats" }, { status: 500 })
  }
}
