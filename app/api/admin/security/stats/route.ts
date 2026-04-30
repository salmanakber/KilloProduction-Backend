import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const [securityLogs, totalAuditLogs, usersWithMFA] = await Promise.all([
      prisma.auditLog.findMany({
        where: { OR: [{ action: { contains: "SECURITY" } }, { action: { contains: "LOGIN" } }] },
        orderBy: { createdAt: "desc" },
        take: 2000,
      }),
      prisma.auditLog.count(),
      prisma.user.count({
        where: {
          OR: [{ role: "ADMIN" }, { role: "SUPER_ADMIN" }],
          twoFactorRequired: true,
        },
      }),
    ])
    const totalEvents = securityLogs.length
    const criticalEvents = securityLogs.filter((item) => item.action.includes("FAILED_LOGIN") || item.action.includes("SUSPICIOUS")).length
    const statusUpdates = securityLogs.filter((item) => item.action === "SECURITY_EVENT_STATUS_UPDATE")
    const resolvedEvents = statusUpdates.filter((item) => String((item.details as any)?.status || "").toUpperCase() === "RESOLVED").length
    const activeThreats = Math.max(0, criticalEvents - resolvedEvents)
    const todayEvents = securityLogs.filter((item) => item.createdAt >= startOfDay).length
    const failedLogins = securityLogs.filter((item) => item.action.includes("FAILED_LOGIN") && item.createdAt >= startOfDay).length

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
