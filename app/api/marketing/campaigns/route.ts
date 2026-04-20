import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { syncCampaignScheduledLaunch } from "@/lib/sync-campaign-launch-queue"

function normalizeChannels(ch: unknown): string[] {
  if (Array.isArray(ch)) return ch.map(String)
  if (ch && typeof ch === "object") return Object.values(ch as object).map(String)
  return []
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const campaigns = await prisma.marketingCampaign.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        targetAudience: true,
        createdBy: { select: { id: true, name: true, email: true } },
        metrics: true,
        abTest: true,
      },
    })

    const formattedCampaigns = campaigns.map((campaign) => {
      const content =
        campaign.content && typeof campaign.content === "object"
          ? (campaign.content as Record<string, unknown>)
          : { message: "" }
      const schedule =
        campaign.schedule && typeof campaign.schedule === "object"
          ? (campaign.schedule as Record<string, unknown>)
          : {}
      const ta = campaign.targetAudience
      const targetAudience = ta
        ? {
            userType: ta.userType,
            modules: ta.modules,
            segments: ta.segments,
            totalUsers: ta.totalUsers,
          }
        : { userType: [], modules: [], segments: [], totalUsers: 0 }

      return {
  id: campaign.id,
  name: campaign.name,
  type: campaign.type,
  status: campaign.status,
  targetAudience,
  channels: normalizeChannels(campaign.channels),
  content: {
    title: (content.title as string) || "",
    message: (content.message as string) || "",
    imageUrl: content.imageUrl as string | undefined,
    actionUrl: content.actionUrl as string | undefined,
    ctaText: content.ctaText as string | undefined,
  },
  schedule: {
    ...schedule,
    startDate:
      (schedule.startDate as string) ||
      (campaign.startDate ? campaign.startDate.toISOString() : new Date().toISOString()),
    endDate: schedule.endDate
      ? (schedule.endDate as string)
      : campaign.endDate
        ? campaign.endDate.toISOString()
        : undefined,
    timezone: (schedule.timezone as string) || campaign.timezone || "UTC",
  },
  // Safely serialize metrics relation (may be null)
  metrics: campaign.metrics ? {
    sent: campaign.metrics.sent,
    delivered: campaign.metrics.delivered,
    opened: campaign.metrics.opened,
    clicked: campaign.metrics.clicked,
    converted: campaign.metrics.converted,
    revenue: campaign.metrics.revenue,
    unsubscribed: campaign.metrics.unsubscribed,
    bounced: campaign.metrics.bounced,
  } : null,
  // Safely serialize abTest relation (may be null)
  abTest: campaign.abTest ? {
    id: campaign.abTest.id,
    name: campaign.abTest.name,
    status: campaign.abTest.status,
  } : null,
  createdAt: campaign.createdAt.toISOString(),
  updatedAt: campaign.updatedAt.toISOString(),
  // Safely serialize createdBy relation (may be null)
  createdBy: campaign.createdBy
    ? typeof campaign.createdBy === "object" && "name" in campaign.createdBy
      ? {
          id: campaign.createdBy.id,
          name: campaign.createdBy.name,
          email: campaign.createdBy.email,
        }
      : String(campaign.createdBy)
    : null,
  startDate: campaign.startDate ? campaign.startDate.toISOString() : null,
  endDate: campaign.endDate ? campaign.endDate.toISOString() : null,
  timezone: campaign.timezone,
      }
    })

    return NextResponse.json({
      campaigns: formattedCampaigns,
      total: campaigns.length,
    })
  } catch (error) {
    console.error("Error fetching marketing campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch marketing campaigns" }, { status: 500 })
  }
}

// --- POST /api/marketing/campaigns ---
// Corrected: Use Prisma nested writes for all relations. Use createdById, not createdBy. Robust error handling for relations.
export async function POST(request: NextRequest) {
  try {
    const user  = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id

    const body = await request.json();
    const {
      name,
      type,
      targetAudience,
      channels,
      content,
      schedule,
      abTest,
    } = body;

    // Validate required fields (createdBy removed — server uses session user)
    if (!name || !type || !channels || !content || !schedule) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sched = schedule as { startDate?: string; endDate?: string; timezone?: string; frequency?: string }
    const start = sched?.startDate ? new Date(sched.startDate) : null
    const end = sched?.endDate ? new Date(sched.endDate) : null
    const now = new Date()
    const initialStatus =
      start && start.getTime() > now.getTime() + 60 * 1000 ? "SCHEDULED" : "DRAFT"

    const taIn = targetAudience && typeof targetAudience === "object" ? targetAudience : {}
    const taCreate = {
      userType: (taIn as any).userType ?? ["CUSTOMER"],
      modules: (taIn as any).modules ?? [],
      segments: (taIn as any).segments ?? [],
      totalUsers: typeof (taIn as any).totalUsers === "number" ? (taIn as any).totalUsers : 0,
    }

    // Prepare relation objects
    const data: any = {
      name,
      type,
      status: initialStatus,
      channels,
      content,
      schedule,
      createdById: userId,
      ...(start ? { startDate: start } : {}),
      ...(end ? { endDate: end } : {}),
      ...(sched?.timezone ? { timezone: sched.timezone } : {}),
      metrics: {
        create: {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          converted: 0,
          revenue: 0,
          unsubscribed: 0,
          bounced: 0,
        },
      },
    };

    // Handle abTest relation
    if (abTest && abTest.id) {
      data.abTest = { connect: { id: abTest.id } };
    } else if (abTest && Object.keys(abTest).length > 0) {
      data.abTest = { create: abTest };
    }

    // Handle targetAudience relation
    if (targetAudience && typeof targetAudience === "object" && (targetAudience as { id?: string }).id) {
      data.targetAudience = { connect: { id: (targetAudience as { id: string }).id } };
    } else {
      data.targetAudience = { create: taCreate };
    }

    const campaign = await prisma.marketingCampaign.create({ data });

    await syncCampaignScheduledLaunch(campaign.id).catch((e) =>
      console.error("[marketing/campaigns POST] syncCampaignScheduledLaunch:", e)
    )

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
      },
    });
  } catch (error) {
    console.error("Error creating marketing campaign:", error);
    return NextResponse.json({ error: "Failed to create marketing campaign" }, { status: 500 });
  }
}

