import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" + user }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period") || "30" // days
    const module = searchParams.get("module")

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - Number.parseInt(period))

    // Get campaign performance
    const campaignStats = await getCampaignStats(startDate, module)

    // Get user engagement metrics
    const engagementStats = await getEngagementStats(startDate, module)

    // Get conversion metrics
    const conversionStats = await getConversionStats(startDate, module)

    // Get segment performance
    const segmentStats = await getSegmentStats(startDate)

    // Get automation performance
    const automationStats = await getAutomationStats(startDate)

    return NextResponse.json({
      campaigns: campaignStats,
      engagement: engagementStats,
      conversions: conversionStats,
      segments: segmentStats,
      automation: automationStats,
      period: Number.parseInt(period),
    })
  } catch (error) {
    console.error("Error fetching marketing analytics:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function getCampaignStats(startDate: Date, module?: string | null) {
  const where: any = {
    createdAt: { gte: startDate },
  }

const campaigns = await prisma.marketingCampaign.findMany({
    where,
    include: {
      _count: {
        select: { participants: true },
      },
    },
  })

  const totalCampaigns = campaigns.length
  const activeCampaigns = campaigns.filter((c) => c.status === "RUNNING").length
  const completedCampaigns = campaigns.filter((c) => c.status === "COMPLETED").length
  const totalSent = campaigns.reduce((sum, c) => sum + c.totalSent, 0)
  const totalDelivered = campaigns.reduce((sum, c) => sum + c.totalDelivered, 0)
  const totalOpened = campaigns.reduce((sum, c) => sum + c.totalOpened, 0)
  const totalClicked = campaigns.reduce((sum, c) => sum + c.totalClicked, 0)
  const totalConverted = campaigns.reduce((sum, c) => sum + c.totalConverted, 0)
  const totalRevenue = campaigns.reduce((sum, c) => sum + c.totalRevenue, 0)

  return {
    totalCampaigns,
    activeCampaigns,
    completedCampaigns,
    totalSent,
    totalDelivered,
    totalOpened,
    totalClicked,
    totalConverted,
    totalRevenue,
    deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
    openRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
    clickRate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
    conversionRate: totalClicked > 0 ? (totalConverted / totalClicked) * 100 : 0,
    revenuePerCampaign: totalCampaigns > 0 ? totalRevenue / totalCampaigns : 0,
  }
}

async function getEngagementStats(startDate: Date, module?: string | null) {
  const where: any = {
    timestamp: { gte: startDate },
  }
  if (module) where.module = module

  const events = await prisma.customerBehaviorEvent.findMany({
    where,
    select: {
      eventType: true,
      userId: true,
      timestamp: true,
    },
  })

  const uniqueUsers = new Set(events.map((e) => e.userId)).size
  const totalEvents = events.length
  const avgEventsPerUser = uniqueUsers > 0 ? totalEvents / uniqueUsers : 0

  // Group events by type
  const eventsByType = events.reduce(
    (acc, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  // Daily engagement trend
  const dailyEngagement = events.reduce(
    (acc, event) => {
      const date = event.timestamp.toISOString().split("T")[0]
      acc[date] = (acc[date] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  return {
    uniqueUsers,
    totalEvents,
    avgEventsPerUser,
    eventsByType,
    dailyEngagement,
  }
}

async function getConversionStats(startDate: Date, module?: string | null) {
  const where: any = {
    createdAt: { gte: startDate },
  }
  if (module) where.module = module

  const orders = await prisma.order.findMany({
    where,
    select: {
      total: true,
      status: true,
      module: true,
      createdAt: true,
    },
  })

  const totalOrders = orders.length
  const completedOrders = orders.filter((o) => o.status === "DELIVERED").length
  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0)
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

  // Daily conversion trend
  const dailyConversions = orders.reduce(
    (acc, order) => {
      const date = order.createdAt.toISOString().split("T")[0]
      if (!acc[date]) {
        acc[date] = { orders: 0, revenue: 0 }
      }
      acc[date].orders += 1
      acc[date].revenue += order.total
      return acc
    },
    {} as Record<string, { orders: number; revenue: number }>,
  )

  return {
    totalOrders,
    completedOrders,
    totalRevenue,
    avgOrderValue,
    completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
    dailyConversions,
  }
}

async function getSegmentStats(startDate: Date) {
  const segments = await prisma.customerSegment.findMany({
    where: {
      createdAt: { gte: startDate },
    },
    include: {
      _count: {
        select: {
          members: true,
        },
      },
    },
  })

  const totalSegments = segments.length
  const activeSegments = segments.filter((s) => s.isActive).length
  const totalMembers = segments.reduce((sum, s) => sum + s._count.members, 0)
  const avgMembersPerSegment = totalSegments > 0 ? totalMembers / totalSegments : 0

  return {
    totalSegments,
    activeSegments,
    totalMembers,
    avgMembersPerSegment,
    segmentTypes: segments.reduce(
      (acc, s) => {
        acc[s.segmentType] = (acc[s.segmentType] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    ),
  }
}

async function getAutomationStats(startDate: Date) {
  const rules = await prisma.automationRule.findMany({
    where: {
      createdAt: { gte: startDate },
    },
  })

  const executions = await prisma.automationExecution.findMany({
    where: {
      executedAt: { gte: startDate },
    },
  })

  const totalRules = rules.length
  const activeRules = rules.filter((r) => r.isActive).length
  const totalExecutions = executions.length
  const successfulExecutions = executions.filter((e) => e.status === "COMPLETED").length
  const failedExecutions = executions.filter((e) => e.status === "FAILED").length

  return {
    totalRules,
    activeRules,
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
  }
}
