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
          status: "INVESTIGATING",
          assignedTo: user.name || user.email || user.id,
          investigationStarted: new Date().toISOString(),
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Security event marked for investigation",
      event: { id: eventId, status: "INVESTIGATING" },
    })
  } catch (error) {
    console.error("Error investigating security event:", error)
    return NextResponse.json({ error: "Failed to investigate security event" }, { status: 500 })
  }
}
