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

    const { searchParams } = new URL(request.url)
    const department = searchParams.get("department")
    const search = searchParams.get("search")

    // Build where clause
    const where: any = {
      role: { in: ["ADMIN", "SUPPORT", "OPERATIONS", "MARKETING", "FINANCE"] },
    }

    if (department && department !== "ALL") {
      where.role = department
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ]
    }

    // Get staff members
    const staff = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        avatar: true,
        twoFactorEnabled: true,
      },
      orderBy: { createdAt: "desc" },
    })

    // Get performance data for each staff member
    const staffWithPerformance = await Promise.all(
      staff.map(async (member) => {
        const [ticketsResolved, avgResponseTime, rating] = await Promise.all([
          prisma.supportTicket.count({
            where: {
              assignedToId: member.id,
              status: "RESOLVED",
            },
          }),
          prisma.supportTicket.aggregate({
            where: {
              assignedToId: member.id,
              status: "RESOLVED",
            },
            _avg: { responseTimeMinutes: true },
          }),
          prisma.staffRating.aggregate({
            where: { staffId: member.id },
            _avg: { rating: true },
          }),
        ])

        return {
          ...member,
          department: member.role,
          status: member.isActive ? "ACTIVE" : "INACTIVE",
          lastLogin: member.lastLoginAt ? member.lastLoginAt.toISOString() : "Never",
          permissions: [], // You'd need to implement a permissions system
          performance: {
            ticketsResolved,
            responseTime: Math.round(avgResponseTime._avg.responseTimeMinutes || 0),
            rating: Math.round((rating._avg.rating || 0) * 10) / 10,
          },
        }
      }),
    )

    return NextResponse.json({ staff: staffWithPerformance })
  } catch (error) {
    console.error("Error fetching staff:", error)
    return NextResponse.json({ error: "Failed to fetch staff" }, { status: 500 })
  }
}
