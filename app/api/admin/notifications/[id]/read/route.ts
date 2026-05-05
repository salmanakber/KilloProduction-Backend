import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const id = params.id
    const updated = await prisma.notification.updateMany({
      where: {
        id,
        module: "ADMIN",
      },
      data: { isRead: true },
    })

    if (updated.count === 0) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    const unreadCount = await prisma.notification.count({
      where: {
        
        module: "ADMIN",
        isArchived: false,
        isRead: false,
      },
    })

    return NextResponse.json({ success: true, unreadCount })
  } catch (e) {
    console.error("admin notification read POST:", e)
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 })
  }
}
