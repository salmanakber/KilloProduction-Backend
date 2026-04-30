import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { UserRole } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Get HR statistics
    const [totalStaff, activeStaff, leaveLogs, totalTicketsResolved, resolvedTicketsWithReplies] = await Promise.all([
      prisma.user.count({ where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] } } }),
      prisma.user.count({
        where: {
          role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
          isActive: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { entityType: "LEAVE_REQUEST" },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.supportTicket.count({
        where: { status: { in: ["RESOLVED", "CLOSED"] } },
      }),
      prisma.supportTicket.findMany({
        where: {
          status: { in: ["RESOLVED", "CLOSED"] },
          replies: { some: { isAdmin: true } },
        },
        select: {
          createdAt: true,
          replies: {
            where: { isAdmin: true },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
    ])

    const requestStatus = new Map<string, string>()
    const requestDetails = new Map<string, Record<string, unknown>>()
    for (const log of leaveLogs) {
      const details = (log.details || {}) as Record<string, unknown>
      if (!requestDetails.has(log.entityId)) requestDetails.set(log.entityId, details)
      if (log.action === "LEAVE_REQUEST_APPROVED") requestStatus.set(log.entityId, "APPROVED")
      else if (log.action === "LEAVE_REQUEST_REJECTED") requestStatus.set(log.entityId, "REJECTED")
      else if (!requestStatus.has(log.entityId)) requestStatus.set(log.entityId, "PENDING")
    }
    const pendingLeaveRequests = Array.from(requestStatus.values()).filter((s) => s === "PENDING").length

    const now = new Date()
    let onLeave = 0
    const countedStaff = new Set<string>()
    requestStatus.forEach((status, requestId) => {
      if (status === "APPROVED") {
        const details = requestDetails.get(requestId) || {}
        const staffId = String(details.staffId || "")
        const startDate = new Date(String(details.startDate || ""))
        const endDate = new Date(String(details.endDate || ""))
        if (
          staffId &&
          !countedStaff.has(staffId) &&
          !Number.isNaN(startDate.getTime()) &&
          !Number.isNaN(endDate.getTime()) &&
          startDate <= now &&
          now <= endDate
        ) {
          onLeave += 1
          countedStaff.add(staffId)
        }
      }
    })

    let averageResponseMinutes = 0
    if (resolvedTicketsWithReplies.length > 0) {
      const totalMinutes = resolvedTicketsWithReplies.reduce((acc, ticket) => {
        const firstReply = ticket.replies[0]
        if (!firstReply) return acc
        const diffMinutes = (firstReply.createdAt.getTime() - ticket.createdAt.getTime()) / (1000 * 60)
        return acc + Math.max(0, diffMinutes)
      }, 0)
      averageResponseMinutes = Math.round(totalMinutes / resolvedTicketsWithReplies.length)
    }

    const stats = {
      totalStaff,
      activeStaff,
      onLeave,
      pendingLeaveRequests,
      averageResponseTime: averageResponseMinutes,
      totalTicketsResolved,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("Error fetching HR stats:", error)
    return NextResponse.json({ error: "Failed to fetch HR stats" }, { status: 500 })
  }
}
