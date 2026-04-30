import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }
    const logs = await prisma.auditLog.findMany({
      where: { entityType: "LEAVE_REQUEST" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        performer: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    const requestMap = new Map<string, Record<string, unknown>>()
    for (const log of logs) {
      const key = log.entityId
      const details = (log.details || {}) as Record<string, unknown>
      const existing = requestMap.get(key) || {
        id: key,
        staffId: details.staffId || "unknown",
        staffName: details.staffName || "Unknown Staff",
        type: details.type || "PERSONAL",
        startDate: details.startDate || log.createdAt,
        endDate: details.endDate || log.createdAt,
        reason: details.reason || "N/A",
        status: "PENDING",
        appliedAt: log.createdAt,
      }

      if (log.action === "LEAVE_REQUEST_APPROVED" && existing.status === "PENDING") {
        existing.status = "APPROVED"
      } else if (log.action === "LEAVE_REQUEST_REJECTED" && existing.status === "PENDING") {
        existing.status = "REJECTED"
      }
      if (log.action === "LEAVE_REQUEST_CREATED" || !requestMap.has(key)) {
        existing.staffId = details.staffId || existing.staffId
        existing.staffName = details.staffName || existing.staffName
        existing.type = details.type || existing.type
        existing.startDate = details.startDate || existing.startDate
        existing.endDate = details.endDate || existing.endDate
        existing.reason = details.reason || existing.reason
        existing.appliedAt = details.appliedAt || existing.appliedAt
      }

      requestMap.set(key, existing)
    }

    return NextResponse.json({ requests: Array.from(requestMap.values()) })
  } catch (error) {
    console.error("Error fetching leave requests:", error)
    return NextResponse.json({ error: "Failed to fetch leave requests" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const staffId = String(body?.staffId || "").trim()
    const type = String(body?.type || "").trim().toUpperCase()
    const reason = String(body?.reason || "").trim()
    const startDateRaw = String(body?.startDate || "").trim()
    const endDateRaw = String(body?.endDate || "").trim()

    if (!staffId || !type || !reason || !startDateRaw || !endDateRaw) {
      return NextResponse.json({ error: "staffId, type, reason, startDate and endDate are required" }, { status: 400 })
    }

    const allowedTypes = new Set(["SICK", "VACATION", "PERSONAL", "EMERGENCY"])
    if (!allowedTypes.has(type)) {
      return NextResponse.json({ error: "Invalid leave type" }, { status: 400 })
    }

    const startDate = new Date(startDateRaw)
    const endDate = new Date(endDateRaw)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid startDate or endDate" }, { status: 400 })
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: "startDate must be before or equal to endDate" }, { status: 400 })
    }

    const staff = await prisma.user.findFirst({
      where: { id: staffId, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      select: { id: true, name: true, email: true },
    })
    if (!staff) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    const leaveRequestId = `leave_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "LEAVE_REQUEST_CREATED",
        entityType: "LEAVE_REQUEST",
        entityId: leaveRequestId,
        details: {
          staffId: staff.id,
          staffName: staff.name || staff.email || "Unknown Staff",
          type,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          reason,
          appliedAt: new Date().toISOString(),
          createdBy: user.name || user.email || user.id,
        },
      },
    })

    return NextResponse.json({ success: true, id: leaveRequestId, status: "PENDING" }, { status: 201 })
  } catch (error) {
    console.error("Error creating leave request:", error)
    return NextResponse.json({ error: "Failed to create leave request" }, { status: 500 })
  }
}
