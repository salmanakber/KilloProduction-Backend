import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const eventId = params.id
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "SECURITY_EVENT_STATUS_UPDATE",
        entityType: "SECURITY_EVENT",
        entityId: eventId,
        details: {
          status: "RESOLVED",
          resolvedAt: new Date().toISOString(),
          resolvedBy: user.name || user.email || user.id,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Security event resolved successfully",
      event: { id: eventId, status: "RESOLVED" },
    })
  } catch (error) {
    console.error("Error resolving security event:", error)
    return NextResponse.json({ error: "Failed to resolve security event" }, { status: 500 })
  }
}
