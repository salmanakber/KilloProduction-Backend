import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

function isLoginFailedAction(action: string) {
  const a = String(action || "").toUpperCase()
  return a.includes("LOGIN_FAILED") || a.includes("FAILED_LOGIN")
}

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

    const [securityLogs, totalAuditLogs, systemSettings, adminCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: { OR: [{ action: { contains: "SECURITY" } }, { action: { contains: "LOGIN" } }] },
        orderBy: { createdAt: "desc" },
        take: 2000,
      }),
      prisma.auditLog.count(),
      // twoFactorRequired lives on SystemSettings, not User
      prisma.systemSettings.findFirst({
        select: { twoFactorRequired: true },
      }),
      prisma.user.count({
        where: {
          OR: [{ role: "ADMIN" }, { role: "SUPER_ADMIN" }],
        },
      }),
    ])

    const usersWithMFA = systemSettings?.twoFactorRequired ? adminCount : 0
    const totalEvents = securityLogs.length
    const criticalEvents = securityLogs.filter(
      (item) => isLoginFailedAction(item.action) || item.action.includes("SUSPICIOUS"),
    ).length
    const statusUpdates = securityLogs.filter((item) => item.action === "SECURITY_EVENT_STATUS_UPDATE")
    const resolvedEvents = statusUpdates.filter(
      (item) => String((item.details as any)?.status || "").toUpperCase() === "RESOLVED",
    ).length
    const activeThreats = Math.max(0, criticalEvents - resolvedEvents)
    const todayEvents = securityLogs.filter((item) => item.createdAt >= startOfDay).length
    const failedLogins = securityLogs.filter(
      (item) => isLoginFailedAction(item.action) && item.createdAt >= startOfDay,
    ).length

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
