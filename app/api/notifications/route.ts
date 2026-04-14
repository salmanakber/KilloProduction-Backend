import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const module = searchParams.get("module")
    const isRead = searchParams.get("isRead")

    // Build where clause
    const where: any = {
      userId: user.id
    }

    if (module) {
      where.module = module
    }

    if (isRead !== null) {
      where.isRead = isRead === "true"
    }

    // Calculate pagination
    const skip = (page - 1) * limit

    // Fetch notifications
    const [notifications, totalCount, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: {
          createdAt: "desc"
        },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          title: true,
          message: true,
          type: true,
          module: true,
          data: true,
          imageUrl: true,
          actionUrl: true,
          isRead: true,
          createdAt: true,
          sentAt: true,
          status: true
        }
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          userId: user.id,
          isRead: false
        }
      })
    ])

    return NextResponse.json({
      notifications,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      },
      unreadCount
    })
  } catch (error) {
    console.error("Notifications fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action")

    if (action === "read-all") {
      // Mark all notifications as read
      await prisma.notification.updateMany({
        where: {
          userId: user.id,
          isRead: false
        },
        data: {
          isRead: true
        }
      })

      return NextResponse.json({ 
        message: "All notifications marked as read",
        unreadCount: 0
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Mark all as read error:", error)
    return NextResponse.json({ error: "Failed to mark notifications as read" }, { status: 500 })
  }
}
