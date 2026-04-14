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
    const status = searchParams.get("status")
    const type = searchParams.get("type")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}
    if (status && status !== "ALL") {
      where.status = status
    }
    if (type && type !== "ALL") {
      where.type = type
    }

    // Get campaigns from database
    const [campaigns, totalCount] = await Promise.all([
      prisma.marketingCampaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: { name: true, email: true },
          },
          _count: {
            select: {
              notifications: true,
            },
          },
        },
      }),
      prisma.marketingCampaign.count({ where }),
    ])

    // Get campaign metrics
    const campaignsWithMetrics = await Promise.all(
      campaigns.map(async (campaign) => {
        const [sentCount, deliveredCount, openedCount, clickedCount] = await Promise.all([
          prisma.notification.count({
            where: { campaignId: campaign.id },
          }),
          prisma.notification.count({
            where: {
              campaignId: campaign.id,
              status: "DELIVERED",
            },
          }),
          prisma.notification.count({
            where: {
              campaignId: campaign.id,
              isRead: true,
            },
          }),
          prisma.notification.count({
            where: {
              campaignId: campaign.id,
              clickedAt: { not: null },
            },
          }),
        ])

        return {
          ...campaign,
          metrics: {
            sent: sentCount,
            delivered: deliveredCount,
            opened: openedCount,
            clicked: clickedCount,
            converted: 0, // This would need conversion tracking
          },
        }
      }),
    )

    return NextResponse.json({
      campaigns: campaignsWithMetrics,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
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

    const campaignData = await request.json()

    // Validate required fields
    const { name, type, targetAudience, channels, content, schedule } = campaignData

    if (!name || !type || !targetAudience || !channels || !content || !schedule) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Create campaign in database
    const campaign = await prisma.marketingCampaign.create({
      data: {
        name,
        type,
        status: "DRAFT",
        targetAudience: JSON.stringify(targetAudience),
        channels: JSON.stringify(channels),
        content: JSON.stringify(content),
        schedule: JSON.stringify(schedule),
        createdById: session.user.id,
      },
      include: {
        createdBy: {
          select: { name: true, email: true },
        },
      },
    })

    // Log admin action
    await prisma.adminAuditLog.create({
      data: {
        adminId: session.user.id,
        action: "CREATE_CAMPAIGN",
        module: "MARKETING",
        details: JSON.stringify({
          campaignId: campaign.id,
          campaignName: name,
          campaignType: type,
        }),
      },
    })

    return NextResponse.json({ campaign }, { status: 201 })
  } catch (error) {
    console.error("Error creating campaign:", error)
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 })
  }
}
