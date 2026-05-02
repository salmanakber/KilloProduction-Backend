import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const now = new Date()

    const [latestTick, sentTodayRows, scheduledDue, scheduledFuture] = await Promise.all([
      prisma.auditLog.findFirst({
        where: {
          entityType: "MARKETING_AUTOMATION",
          action: "MARKETING_AUTOMATION_TICK",
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.findMany({
        where: {
          createdAt: { gte: today },
          type: "PROMOTION",
        },
        select: { data: true },
        take: 5000,
      }),
      prisma.marketingCampaign.count({
        where: {
          status: { in: ["SCHEDULED", "RUNNING"] },
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      }),
      prisma.marketingCampaign.count({
        where: {
          status: "SCHEDULED",
          startDate: { gt: now },
        },
      }),
    ])

    const sentToday = sentTodayRows.filter((n) => {
      const payload = (n.data || {}) as Record<string, unknown>
      return payload.source === "marketing_automation"
    }).length

    const tickDetails = ((latestTick?.details || {}) as Record<string, unknown>) || {}
    const dailyCap = Number(tickDetails.dailyCap || process.env.MARKETING_AUTOMATION_DAILY_LIMIT || 150)
    const runCap = Number(tickDetails.runCap || process.env.MARKETING_AUTOMATION_RUN_LIMIT || 40)

    return NextResponse.json({
      success: true,
      health: {
        marketingAiEnabled: String(process.env.MARKETING_AI_ENABLED || "true").toLowerCase() !== "false",
        marketingIntervalMs: Number(process.env.MARKETING_AUTOMATION_MS || 6 * 60 * 60 * 1000),
        catchupIntervalMs: Number(process.env.MARKETING_SCHEDULED_CATCHUP_MS || 60 * 1000),
        dailyCap,
        runCap,
        sentToday,
        remainingToday: Math.max(0, dailyCap - sentToday),
        latestTick: latestTick
          ? {
              at: latestTick.createdAt.toISOString(),
              sent: Number(tickDetails.sent || 0),
              skipped: String(tickDetails.skipped || "unknown"),
              candidates: Number(tickDetails.candidates || 0),
            }
          : null,
        scheduledCampaigns: {
          dueNow: scheduledDue,
          future: scheduledFuture,
        },
      },
    })
  } catch (error) {
    console.error("admin/marketing/health:", error)
    return NextResponse.json({ error: "Failed to fetch marketing health" }, { status: 500 })
  }
}
