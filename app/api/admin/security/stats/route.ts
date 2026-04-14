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

    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    // Get security statistics
    const [
      totalEvents,
      criticalEvents,
      resolvedEvents,
      activeThreats,
      usersWithMFA,
      totalAuditLogs,
      todayEvents,
      failedLogins,
    ] = await Promise.all([
      prisma.securityEvent.count(),
      prisma.securityEvent.count({
        where: { severity: "CRITICAL" },
      }),
      prisma.securityEvent.count({
        where: { status: "RESOLVED" },
      }),
      prisma.securityEvent.count({
        where: {
          status: { in: ["OPEN", "INVESTIGATING"] },
          severity: { in: ["HIGH", "CRITICAL"] },
        },
      }),
      prisma.user.count({
        where: { twoFactorEnabled: true },
      }),
      prisma.adminAuditLog.count(),
      prisma.securityEvent.count({
        where: {
          createdAt: { gte: startOfDay },
        },
      }),
      prisma.securityEvent.count({
        where: {
          eventType: "FAILED_LOGIN",
          createdAt: { gte: startOfDay },
        },
      }),
    ])

    const stats = {
      totalEvents,
      criticalEvents,
      resolvedEvents,
      activeThreats,
      usersWithMFA,
      totalAuditLogs,
      todayEvents,
      failedLogins,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("Error fetching security stats:", error)
    return NextResponse.json({ error: "Failed to fetch security stats" }, { status: 500 })
  }
}
