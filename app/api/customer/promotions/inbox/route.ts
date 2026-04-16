import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

/**
 * In-app promotions: campaigns in window (SCHEDULED | RUNNING) filtered by:
 * - explicit participation (launch), or
 * - broadcast (no segment links), or
 * - user's active segment memberships intersecting campaign-linked segments.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()

    const [memberships, rawCampaigns] = await Promise.all([
      prisma.customerSegmentMember.findMany({
        where: { userId: user.id, isActive: true },
        select: { segmentId: true },
      }),
      prisma.marketingCampaign.findMany({
        where: {
          status: { in: ["SCHEDULED", "RUNNING"] },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
          AND: [{ OR: [{ startDate: null }, { startDate: { lte: now } }] }],
        },
        include: {
          CampaignSegments: { select: { A: true } },
          participants: {
            where: { userId: user.id },
            select: { id: true },
            take: 1,
          },
        },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        take: 80,
      }),
    ])

    const userSegments = new Set(memberships.map((m) => m.segmentId))

    const campaigns = rawCampaigns.filter((c) => {
      if (c.participants.length > 0) return true
      const linked = c.CampaignSegments ?? []
      if (linked.length === 0) return true
      return linked.some((row) => userSegments.has(row.A))
    })

    const payload = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      type: c.type,
      status: c.status,
      startDate: c.startDate?.toISOString() ?? null,
      endDate: c.endDate?.toISOString() ?? null,
      timezone: c.timezone,
      schedule: c.schedule,
      content: c.content,
      priority: c.priority,
      matchedBy:
        c.participants.length > 0 ? "participant" : (c.CampaignSegments?.length ?? 0) === 0 ? "broadcast" : "segment",
    }))

    return NextResponse.json({ success: true, campaigns: payload })
  } catch (e) {
    console.error("promotions/inbox:", e)
    return NextResponse.json({ error: "Failed to load promotions" }, { status: 500 })
  }
}
