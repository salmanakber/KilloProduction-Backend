import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || "ALL"

    const where: any = {}

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { message: { contains: search, mode: "insensitive" } },
      ]
    }

    if (status !== "ALL") {
      where.status = status
    }

    const campaigns = await prisma.notificationCampaign.findMany({
      where,
      include: {
        createdBy: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const formattedCampaigns = campaigns.map((campaign) => ({
      id: campaign.id,
      title: campaign.title,
      message: campaign.message,
      type: campaign.type,
      status: campaign.status,
      targetAudience: {
        userTypes: campaign.targetUserTypes || [],
        modules: campaign.targetModules || [],
        totalUsers: campaign.targetUserCount || 0,
      },
      scheduledAt: campaign.scheduledAt?.toISOString(),
      sentAt: campaign.sentAt?.toISOString(),
      metrics: {
        sent: campaign.sentCount || 0,
        delivered: campaign.deliveredCount || 0,
        opened: campaign.openedCount || 0,
        clicked: campaign.clickedCount || 0,
      },
      createdAt: campaign.createdAt.toISOString(),
      createdBy: campaign.createdBy?.name || "Unknown",
    }))

    return NextResponse.json({ campaigns: formattedCampaigns })
  } catch (error) {
    console.error("Error fetching notification campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch notification campaigns" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { title, message, type, targetAudience, scheduledAt, imageUrl, actionUrl } = await request.json()

    // Calculate target user count
    const targetUserCount = await prisma.user.count({
      where: {
        AND: [
          targetAudience.userTypes.length > 0 ? { role: { in: targetAudience.userTypes } } : {},
          // Add module filtering logic here if needed
        ],
      },
    })

    const campaign = await prisma.notificationCampaign.create({
      data: {
        title,
        message,
        type,
        targetUserTypes: targetAudience.userTypes,
        targetModules: targetAudience.modules,
        targetUserCount,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        imageUrl,
        actionUrl,
        status: scheduledAt ? "SCHEDULED" : "DRAFT",
        createdById: session.user.id,
      },
    })

    // Create audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId: session.user.id,
        action: "CREATE_NOTIFICATION_CAMPAIGN",
        module: "NOTIFICATION_MANAGEMENT",
        targetId: campaign.id,
        details: {
          title,
          type,
          targetUserCount,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Campaign created successfully",
      campaign,
    })
  } catch (error) {
    console.error("Error creating notification campaign:", error)
    return NextResponse.json({ error: "Failed to create notification campaign" }, { status: 500 })
  }
}
