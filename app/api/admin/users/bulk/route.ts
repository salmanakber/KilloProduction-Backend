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

    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (adminUser?.role !== "ADMIN" && adminUser?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { userIds, action } = await request.json()

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "User IDs are required" }, { status: 400 })
    }

    let updateData: any = {}
    let notificationTitle = ""
    let notificationMessage = ""

    switch (action) {
      case "activate":
        updateData = { isActive: true }
        notificationTitle = "Account Activated"
        notificationMessage = "Your account has been activated by admin."
        break
      case "deactivate":
        updateData = { isActive: false }
        notificationTitle = "Account Deactivated"
        notificationMessage = "Your account has been deactivated by admin."
        break
      case "suspend":
        updateData = { isActive: false, status: "SUSPENDED" }
        notificationTitle = "Account Suspended"
        notificationMessage = "Your account has been suspended by admin."
        break
      case "verify":
        updateData = { isVerified: true }
        notificationTitle = "Account Verified"
        notificationMessage = "Your account has been verified by admin."
        break
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    // Update users
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: updateData,
    })

    // Log admin action
    await prisma.adminAuditLog.create({
      data: {
        adminId: session.user.id,
        action: `BULK_${action.toUpperCase()}`,
        module: "USER_MANAGEMENT",
        details: {
          userIds,
          action,
          affectedCount: userIds.length,
        },
      },
    })

    // Send notifications to affected users
    const notifications = userIds.map((userId: string) => ({
      userId,
      title: notificationTitle,
      message: notificationMessage,
      type: "SYSTEM",
    }))

    await prisma.notification.createMany({
      data: notifications,
    })

    return NextResponse.json({
      success: true,
      message: `Successfully ${action}d ${userIds.length} user(s)`,
      affectedCount: userIds.length,
    })
  } catch (error) {
    console.error("Error performing bulk action:", error)
    return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 })
  }
}
