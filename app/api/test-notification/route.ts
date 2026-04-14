import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { title, message, module, type } = await request.json()

    // Create test notification
    const notification = await NotificationBridge.sendNotification({
      userId: user.id,
      title: title || "Test Notification",
      message: message || "This is a test notification",
      type: type || "SYSTEM",
      module: module || "GENERAL",
      data: {
        test: true,
        timestamp: new Date().toISOString()
      }
    })

    return NextResponse.json({
      message: "Test notification sent successfully",
      notification
    })
  } catch (error) {
    console.error("Test notification error:", error)
    return NextResponse.json({ error: "Failed to send test notification" }, { status: 500 })
  }
}
