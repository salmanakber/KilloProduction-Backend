import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = params
    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action")

    if (action === "read") {
      // Mark notification as read
      const notification = await prisma.notification.update({
        where: {
          id,
          userId: user.id // Ensure user owns this notification
        },
        data: {
          isRead: true
        }
      })

      if (!notification) {
        return NextResponse.json({ error: "Notification not found" }, { status: 404 })
      }

      // Get updated unread count
      const unreadCount = await prisma.notification.count({
        where: {
          userId: user.id,
          isRead: false
        }
      })

      return NextResponse.json({ 
        message: "Notification marked as read",
        notification,
        unreadCount
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Mark notification as read error:", error)
    return NextResponse.json({ error: "Failed to mark notification as read" }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = params

    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId: user.id
      }
    })

    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    return NextResponse.json({ notification })
  } catch (error) {
    console.error("Get notification error:", error)
    return NextResponse.json({ error: "Failed to get notification" }, { status: 500 })
  }
}
