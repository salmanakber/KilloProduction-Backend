import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

async function getCampaignStats(_startDate: Date, _module?: string | null) {
  const campaigns = await prisma.marketingCampaign.findMany({
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
  const draftCampaigns = campaigns.filter((c) => c.status === "DRAFT").length
  const scheduledCampaigns = campaigns.filter((c) => c.status === "SCHEDULED").length
  const pausedCampaigns = campaigns.filter((c) => c.status === "PAUSED").length

  return {
    totalCampaigns,
    activeCampaigns,
    completedCampaigns,
    draftCampaigns,
    scheduledCampaigns,
    pausedCampaigns,
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

  // Daily engagement trend — UI expects { date, events, users }[]
  const byDay: Record<string, { events: number; users: Set<string> }> = {}
  for (const event of events) {
    const date = event.timestamp.toISOString().split("T")[0]
    if (!byDay[date]) byDay[date] = { events: 0, users: new Set() }
    byDay[date].events += 1
    byDay[date].users.add(event.userId)
  }
  const dailyEngagement = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      events: v.events,
      users: v.users.size,
    }))

  const pageViews = await prisma.customerBehaviorEvent.findMany({
    where: {
      ...where,
      eventType: "PAGE_VIEW",
    },
    select: { properties: true, userId: true },
    take: 5000,
  })
  const pageCounts: Record<string, { views: number; users: Set<string> }> = {}
  for (const pv of pageViews) {
    const meta = pv.properties as Record<string, unknown> | null
    const page =
      (meta && typeof meta.page === "string" && meta.page) ||
      (meta && typeof meta.path === "string" && meta.path) ||
      "/"
    if (!pageCounts[page]) pageCounts[page] = { views: 0, users: new Set() }
    pageCounts[page].views += 1
    pageCounts[page].users.add(pv.userId)
  }
  const topPages = Object.entries(pageCounts)
    .map(([page, v]) => ({ page, views: v.views, uniqueUsers: v.users.size }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 15)

  return {
    uniqueUsers,
    totalEvents,
    avgEventsPerUser,
    eventsByType,
    dailyEngagement,
    topPages,
    sessionDuration: 0,
    bounceRate: 0,
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

  const dailyMap = orders.reduce(
    (acc, order) => {
      const date = order.createdAt.toISOString().split("T")[0]
      if (!acc[date]) {
        acc[date] = { orders: 0, revenue: 0, conversions: 0 }
      }
      acc[date].orders += 1
      acc[date].revenue += order.total
      if (order.status === "DELIVERED") acc[date].conversions += 1
      return acc
    },
    {} as Record<string, { orders: number; revenue: number; conversions: number }>,
  )

  const dailyConversions = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      orders: v.orders,
      revenue: v.revenue,
      conversions: v.conversions,
    }))

  return {
    totalOrders,
    completedOrders,
    totalRevenue,
    avgOrderValue,
    completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
    dailyConversions,
    topProducts: [] as Array<{ product: string; orders: number; revenue: number }>,
    conversionFunnel: [
      { stage: "Orders", users: totalOrders, rate: 100 },
      {
        stage: "Delivered",
        users: completedOrders,
        rate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
      },
    ],
  }
}

async function getSegmentStats(_startDate: Date) {
  const segments = await prisma.customerSegment.findMany({
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

  const topSegments = [...segments]
    .sort((a, b) => b._count.members - a._count.members)
    .slice(0, 10)
    .map((s) => ({
      name: s.name,
      members: s._count.members,
      engagement: 0,
      revenue: 0,
    }))

  const segmentPerformance = topSegments.map((s) => ({
    segment: s.name,
    openRate: 0,
    clickRate: 0,
    conversionRate: 0,
  }))

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
    topSegments,
    segmentPerformance,
  }
}

async function getAutomationStats(startDate: Date) {
  const rules = await prisma.automationRule.findMany({})

  const executions = await prisma.automationExecution.findMany({
    where: {
      executedAt: { gte: startDate },
    },
    orderBy: { executedAt: "desc" },
  })

  const totalRules = rules.length
  const activeRules = rules.filter((r) => r.isActive).length
  const totalExecutions = executions.length
  const successfulExecutions = executions.filter((e) => e.status === "COMPLETED").length
  const failedExecutions = executions.filter((e) => e.status === "FAILED").length

  const recentExecutions = executions.slice(0, 20).map((e) => ({
    rule: e.ruleId || "—",
    trigger: e.trigger || "—",
    status: e.status,
    timestamp: e.executedAt.toISOString(),
  }))

  const topTriggers = rules.slice(0, 8).map((r) => ({
    trigger: r.name,
    executions: 0,
    successRate: r.isActive ? 100 : 0,
  }))

  return {
    totalRules,
    activeRules,
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
    topTriggers,
    recentExecutions,
  }
}
