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

    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range") || "24h"
    const severity = searchParams.get("severity")
    const search = (searchParams.get("search") || "").toLowerCase()
    const limit = Number.parseInt(searchParams.get("limit") || "100")
    const now = new Date()
    const startDate = new Date(now)
    if (range === "1h") startDate.setHours(startDate.getHours() - 1)
    else if (range === "7d") startDate.setDate(startDate.getDate() - 7)
    else if (range === "30d") startDate.setDate(startDate.getDate() - 30)
    else startDate.setDate(startDate.getDate() - 1)

    const logs = await prisma.auditLog.findMany({
      where: {
        createdAt: { gte: startDate },
        OR: [{ action: { contains: "LOGIN" } }, { action: { contains: "SECURITY" } }],
      },
      orderBy: { createdAt: "desc" },
      take: Math.max(20, limit),
      include: {
        performer: { select: { id: true, name: true, email: true, role: true } },
      },
    })

    const statusUpdates = await prisma.auditLog.findMany({
      where: {
        action: "SECURITY_EVENT_STATUS_UPDATE",
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    })
    const statusMap = new Map<string, "OPEN" | "INVESTIGATING" | "RESOLVED">()
    for (const item of statusUpdates) {
      if (statusMap.has(item.entityId)) continue
      const details = (item.details || {}) as any
      const nextStatus = String(details?.status || "OPEN").toUpperCase()
      if (nextStatus === "INVESTIGATING" || nextStatus === "RESOLVED") statusMap.set(item.entityId, nextStatus)
    }

    const formattedEvents = logs
      .map((log) => {
        const action = String(log.action || "")
        const critical = action.includes("FAILED_LOGIN") || action.includes("SUSPICIOUS")
        const sev = critical ? "HIGH" : action.includes("SECURITY") ? "MEDIUM" : "LOW"
        const details = (log.details || {}) as any
        return {
          id: log.id,
          type: action.includes("FAILED_LOGIN") ? "FAILED_LOGIN" : action.includes("PASSWORD") ? "PASSWORD_CHANGE" : "LOGIN",
          severity: sev,
          userId: log.performedBy,
          userName: log.performer?.name || "Unknown",
          userRole: log.performer?.role || "ADMIN",
          description: details?.description || action.replaceAll("_", " "),
          ipAddress: log.ipAddress || "N/A",
          userAgent: log.userAgent || "N/A",
          location: "Unknown",
          timestamp: log.createdAt,
          status: statusMap.get(log.id) || "OPEN",
        }
      })
      .filter((event) => (severity && severity !== "ALL" ? event.severity === severity : true))
      .filter((event) => {
        if (!search) return true
        const haystack = `${event.userName} ${event.description} ${event.ipAddress}`.toLowerCase()
        return haystack.includes(search)
      })

    return NextResponse.json({
      events: formattedEvents,
    })
  } catch (error) {
    console.error("Error fetching security events:", error)
    return NextResponse.json({ error: "Failed to fetch security events" }, { status: 500 })
  }
}
