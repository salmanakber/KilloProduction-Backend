import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { notificationId, markAll } = await request.json()

    if (markAll) {
      // Mark all notifications as read
      await prisma.notification.updateMany({
        where: {
          userId: session.user.id,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      })

      return NextResponse.json({ success: true })
    }

    if (!notificationId) {
      return NextResponse.json({ error: "Notification ID is required" }, { status: 400 })
    }

    const notification = await prisma.notification.update({
      where: {
        id: notificationId,
        userId: session.user.id,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    return NextResponse.json({ notification })
  } catch (error) {
    console.error("Error marking notification as read:", error)
    return NextResponse.json({ error: "Failed to mark notification as read" }, { status: 500 })
  }
}
