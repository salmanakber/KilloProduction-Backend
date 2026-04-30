import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await authenticateRequest(request)
    if (!actor?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const leaveLogs = await prisma.auditLog.findMany({
      where: {
        entityType: "LEAVE_REQUEST",
        entityId: params.id,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    if (leaveLogs.length === 0) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    const latestDecision = leaveLogs.find(
      (log) => log.action === "LEAVE_REQUEST_APPROVED" || log.action === "LEAVE_REQUEST_REJECTED",
    )
    if (latestDecision?.action === "LEAVE_REQUEST_REJECTED") {
      return NextResponse.json({ success: true, status: "REJECTED" })
    }

    const baseDetails: Record<string, unknown> = {}
    for (const log of leaveLogs) {
      const details = (log.details || {}) as Record<string, unknown>
      if (!baseDetails.staffId && details.staffId) baseDetails.staffId = details.staffId
      if (!baseDetails.staffName && details.staffName) baseDetails.staffName = details.staffName
      if (!baseDetails.type && details.type) baseDetails.type = details.type
      if (!baseDetails.startDate && details.startDate) baseDetails.startDate = details.startDate
      if (!baseDetails.endDate && details.endDate) baseDetails.endDate = details.endDate
      if (!baseDetails.reason && details.reason) baseDetails.reason = details.reason
      if (Object.keys(baseDetails).length >= 6) break
    }

    await prisma.auditLog.create({
      data: {
        performedBy: actor.id,
        action: "LEAVE_REQUEST_REJECTED",
        entityType: "LEAVE_REQUEST",
        entityId: params.id,
        details: {
          ...baseDetails,
          rejectedAt: new Date().toISOString(),
          rejectedBy: actor.name || actor.email || actor.id,
        },
      },
    })

    return NextResponse.json({ success: true, status: "REJECTED" })
  } catch (error) {
    console.error("Error rejecting leave request:", error)
    return NextResponse.json({ error: "Failed to reject leave request" }, { status: 500 })
  }
}
