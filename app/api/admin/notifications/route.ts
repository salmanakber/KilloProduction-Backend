import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { NotificationType } from "@prisma/client"

/** Map DB notification types to AdminHeader bell UI variants */
function toUiNotificationType(t: NotificationType): "INFO" | "WARNING" | "ERROR" | "SUCCESS" {
  switch (t) {
    case "ORDER_CONFIRMED":
    case "refund_processed":
    case "SERVICE_COMPLETED":
      return "SUCCESS"
    case "refund_requested":
    case "REMINDER":
    case "PROMOTION":
      return "WARNING"
    case "PAYMENT":
      return "INFO"
    default:
      return "INFO"
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10)))

    const where = {
      module: "ADMIN" as const,
      isArchived: false,
    }

    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          isRead: true,
          createdAt: true,
          actionUrl: true,
          data: true,
        },
      }),
      prisma.notification.count({
        where: {
          ...where,
          isRead: false,
        },
      }),
    ])

    const notifications = rows.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: toUiNotificationType(n.type),
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }))

    return NextResponse.json({ notifications, unreadCount })
  } catch (e) {
    console.error("admin notifications GET:", e)
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 })
  }
}
