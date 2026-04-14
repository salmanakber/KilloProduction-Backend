import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateFromCookie } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateFromCookie()
  

    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { title, message, userId, testType } = await request.json()

    if (!title || !message) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 })
    }

    let results = []

    if (testType === "specific_user" && userId) {
      // Send to specific user
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { userSettings: true }
      })

      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }

      const notification = await NotificationBridge.sendNotification({
        userId: targetUser.id,
        title,
        message,
        type: "SYSTEM",
        module: "TEST"
      })

      results.push({
        userId: targetUser.id,
        userName: targetUser.name,
        success: true,
        notificationId: notification.id
      })
    } else {
      // Send to all users with device tokens
      const usersWithTokens = await prisma.user.findMany({
        where: {
          userSettings: {
            pushNotifications: true,
                deviceTokens: {
              not: null
            }
          }
        },
        include: { userSettings: true },
        take: 10 // Limit to 10 users for testing
      })

      for (const targetUser of usersWithTokens) {
        try {
          const notification = await NotificationBridge.sendNotification({
            userId: targetUser.id,
            title,
            message,
            type: "SYSTEM",
            module: "TEST"
          })

          results.push({
            userId: targetUser.id,
            userName: targetUser.name,
            success: true,
            notificationId: notification.id
          })
        } catch (error) {
          results.push({
            userId: targetUser.id,
            userName: targetUser.name,
            success: false,
            error: error.message
          })
        }
      }
    }

    return NextResponse.json({
      message: "Test notifications sent",
      results,
      totalSent: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length
    })
  } catch (error) {
    console.error("Test notification error:", error)
    return NextResponse.json({ error: "Failed to send test notifications" }, { status: 500 })
  }
}
