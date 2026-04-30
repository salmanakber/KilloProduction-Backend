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
    const start = new Date()
    if (range === "1h") start.setHours(start.getHours() - 1)
    else if (range === "7d") start.setDate(start.getDate() - 7)
    else if (range === "30d") start.setDate(start.getDate() - 30)
    else start.setDate(start.getDate() - 1)

    const logs = await prisma.auditLog.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { performer: { select: { id: true, name: true } } },
    })

    return NextResponse.json({
      logs: logs.map((log) => ({
        id: log.id,
        adminId: log.performedBy,
        adminName: log.performer?.name || "System",
        action: log.action,
        module: log.entityType,
        targetId: log.entityId,
        targetType: log.entityType,
        details: log.details,
        timestamp: log.createdAt,
        ipAddress: log.ipAddress || "N/A",
      })),
    })
  } catch (error) {
    console.error("Error fetching audit logs:", error)
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 })
  }
}
