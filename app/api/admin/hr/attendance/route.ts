import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { UserRole } from "@prisma/client"

type AttendanceStatus = "PRESENT" | "ABSENT" | "ON_LEAVE"

const getDateWindow = (input?: string | null) => {
  const base = input ? new Date(input) : new Date()
  if (Number.isNaN(base.getTime())) return null
  const start = new Date(base)
  start.setHours(0, 0, 0, 0)
  const end = new Date(base)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

const parseStatusFromLog = (details: Record<string, unknown>): AttendanceStatus | null => {
  const raw = String(details.status || "").toUpperCase()
  if (raw === "PRESENT" || raw === "ABSENT" || raw === "ON_LEAVE") return raw
  return null
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get("date")
    const window = getDateWindow(dateParam)
    if (!window) return NextResponse.json({ error: "Invalid date query" }, { status: 400 })

    const [staff, approvedLeaves, attendanceLogs] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] } },
        include: { adminProfile: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: "LEAVE_REQUEST",
          action: "LEAVE_REQUEST_APPROVED",
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: "HR_ATTENDANCE",
          createdAt: { gte: window.start, lte: window.end },
        },
        orderBy: { createdAt: "desc" },
        take: 3000,
      }),
    ])

    const onLeaveIds = new Set<string>()
    for (const leave of approvedLeaves) {
      const details = (leave.details || {}) as Record<string, unknown>
      const staffId = String(details.staffId || "")
      const startDate = new Date(String(details.startDate || ""))
      const endDate = new Date(String(details.endDate || ""))
      if (!staffId || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) continue
      if (startDate <= window.end && window.start <= endDate) onLeaveIds.add(staffId)
    }

    const manualStatusByStaff = new Map<string, AttendanceStatus>()
    for (const log of attendanceLogs) {
      const details = (log.details || {}) as Record<string, unknown>
      const staffId = String(details.staffId || "")
      const parsedStatus = parseStatusFromLog(details)
      if (!staffId || !parsedStatus || manualStatusByStaff.has(staffId)) continue
      manualStatusByStaff.set(staffId, parsedStatus)
    }

    const records = staff.map((member) => {
      let status: AttendanceStatus = "ABSENT"
      if (onLeaveIds.has(member.id)) status = "ON_LEAVE"
      else if (manualStatusByStaff.has(member.id)) status = manualStatusByStaff.get(member.id) as AttendanceStatus
      else if (member.lastLoginAt && member.lastLoginAt >= window.start && member.lastLoginAt <= window.end) status = "PRESENT"

      return {
        staffId: member.id,
        name: member.name || member.email || "Unknown",
        email: member.email || "",
        department: member.adminProfile?.department || member.role,
        status,
        lastLoginAt: member.lastLoginAt ? member.lastLoginAt.toISOString() : null,
      }
    })

    const summary = {
      total: records.length,
      present: records.filter((r) => r.status === "PRESENT").length,
      absent: records.filter((r) => r.status === "ABSENT").length,
      onLeave: records.filter((r) => r.status === "ON_LEAVE").length,
    }

    return NextResponse.json({
      date: window.start.toISOString(),
      summary,
      records,
    })
  } catch (error) {
    console.error("Error fetching attendance:", error)
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const staffId = String(body?.staffId || "").trim()
    const status = String(body?.status || "").trim().toUpperCase() as AttendanceStatus
    const dateInput = body?.date ? String(body.date) : null
    const window = getDateWindow(dateInput)

    if (!staffId || !window) {
      return NextResponse.json({ error: "staffId and valid date are required" }, { status: 400 })
    }
    if (!["PRESENT", "ABSENT", "ON_LEAVE"].includes(status)) {
      return NextResponse.json({ error: "Invalid attendance status" }, { status: 400 })
    }

    const staff = await prisma.user.findFirst({
      where: { id: staffId, role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] } },
      select: { id: true, name: true, email: true },
    })
    if (!staff) return NextResponse.json({ error: "Staff member not found" }, { status: 404 })

    const entityId = `${staffId}_${window.start.toISOString().slice(0, 10)}`
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "HR_ATTENDANCE_MARKED",
        entityType: "HR_ATTENDANCE",
        entityId,
        details: {
          staffId: staff.id,
          staffName: staff.name || staff.email || "Unknown",
          status,
          date: window.start.toISOString(),
          markedBy: user.name || user.email || user.id,
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error marking attendance:", error)
    return NextResponse.json({ error: "Failed to mark attendance" }, { status: 500 })
  }
}
