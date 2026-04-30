import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { parseAdminAccess } from "@/lib/admin-access"
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

    const { searchParams } = new URL(request.url)
    const department = searchParams.get("department")
    const search = searchParams.get("search")

    // Build where clause
    const where: Record<string, unknown> = {
      role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
    }

    if (department && department !== "ALL") {
      where.adminProfile = {
        is: {
          department: { equals: department, mode: "insensitive" },
        },
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ]
    }

    const leaveLogs = await prisma.auditLog.findMany({
      where: {
        entityType: "LEAVE_REQUEST",
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    })
    const leaveStatusByRequest = new Map<string, "PENDING" | "APPROVED" | "REJECTED">()
    const leaveDetailsByRequest = new Map<string, Record<string, unknown>>()
    for (const log of leaveLogs) {
      const details = (log.details || {}) as Record<string, unknown>
      if (!leaveDetailsByRequest.has(log.entityId) && Object.keys(details).length > 0) {
        leaveDetailsByRequest.set(log.entityId, details)
      }
      if (log.action === "LEAVE_REQUEST_APPROVED") leaveStatusByRequest.set(log.entityId, "APPROVED")
      else if (log.action === "LEAVE_REQUEST_REJECTED") leaveStatusByRequest.set(log.entityId, "REJECTED")
      else if (!leaveStatusByRequest.has(log.entityId)) leaveStatusByRequest.set(log.entityId, "PENDING")
    }

    const activeOnLeaveStaffIds = new Set<string>()
    const now = new Date()
    leaveStatusByRequest.forEach((status, requestId) => {
      if (status === "APPROVED") {
        const details = leaveDetailsByRequest.get(requestId) || {}
        const staffId = String(details.staffId || "")
        const startDate = new Date(String(details.startDate || ""))
        const endDate = new Date(String(details.endDate || ""))
        if (staffId && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && startDate <= now && now <= endDate) {
          activeOnLeaveStaffIds.add(staffId)
        }
      }
    })

    // Get staff members
    const staff = await prisma.user.findMany({
      where: where as any,
      include: { adminProfile: true },
      orderBy: { createdAt: "desc" },
    })

    const staffIds = staff.map((member) => member.id)
    const [resolvedByAssignee, repliesByUser, ticketsForResponseTime] = await Promise.all([
      prisma.supportTicket.groupBy({
        by: ["assignedTo"],
        where: {
          status: { in: ["RESOLVED", "CLOSED"] },
          assignedTo: { in: staffIds },
        },
        _count: { _all: true },
      }),
      prisma.supportTicketReply.groupBy({
        by: ["userId"],
        where: {
          isAdmin: true,
          userId: { in: staffIds },
        },
        _count: { _all: true },
      }),
      prisma.supportTicket.findMany({
        where: {
          assignedTo: { in: staffIds },
          replies: { some: { isAdmin: true } },
        },
        select: {
          assignedTo: true,
          createdAt: true,
          replies: {
            where: { isAdmin: true, userId: { in: staffIds } },
            orderBy: { createdAt: "asc" },
            select: { userId: true, createdAt: true },
          },
        },
      }),
    ])

    const resolvedMap = new Map<string, number>()
    for (const row of resolvedByAssignee) {
      if (row.assignedTo) resolvedMap.set(row.assignedTo, row._count._all)
    }

    const repliesMap = new Map<string, number>()
    for (const row of repliesByUser) {
      repliesMap.set(row.userId, row._count._all)
    }

    const responseMinutesMap = new Map<string, number[]>()
    for (const ticket of ticketsForResponseTime) {
      const assignedTo = ticket.assignedTo || ""
      if (!assignedTo) continue
      const firstAssignedReply = ticket.replies.find((reply) => reply.userId === assignedTo)
      if (!firstAssignedReply) continue
      const diffMinutes = (firstAssignedReply.createdAt.getTime() - ticket.createdAt.getTime()) / (1000 * 60)
      const cleanMinutes = Math.max(0, Math.round(diffMinutes))
      responseMinutesMap.set(assignedTo, [...(responseMinutesMap.get(assignedTo) || []), cleanMinutes])
    }

    const getPerformanceRating = (resolvedCount: number, adminReplyCount: number, avgResponseMinutes: number) => {
      const hasActivity = resolvedCount > 0 || adminReplyCount > 0
      if (!hasActivity) return 0
      const outputBonus = Math.min(resolvedCount, 40) / 20
      const collaborationBonus = Math.min(adminReplyCount, 80) / 80
      const responsePenalty = avgResponseMinutes > 0 ? Math.min(avgResponseMinutes, 480) / 480 : 0
      const rating = 2.5 + outputBonus + collaborationBonus - responsePenalty
      return Math.max(1, Math.min(5, Math.round(rating * 10) / 10))
    }

    // Get performance data for each staff member
    const staffWithPerformance = await Promise.all(
      staff.map(async (member) => {
        const ticketsResolved = resolvedMap.get(member.id) || 0
        const adminReplies = repliesMap.get(member.id) || 0
        const responseTimes = responseMinutesMap.get(member.id) || []
        const avgResponseTime =
          responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0
        const rating = getPerformanceRating(ticketsResolved, adminReplies, avgResponseTime)

        return {
          ...member,
          department: member.adminProfile?.department || member.role,
          role: parseAdminAccess(member.adminProfile?.permissions, member.role).accessRole,
          status: activeOnLeaveStaffIds.has(member.id) ? "ON_LEAVE" : member.isActive ? "ACTIVE" : "INACTIVE",
          lastLogin: member.lastLoginAt ? member.lastLoginAt.toISOString() : "Never",
          permissions: parseAdminAccess(member.adminProfile?.permissions, member.role).grants,
          performance: {
            ticketsResolved,
            responseTime: avgResponseTime,
            rating,
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
