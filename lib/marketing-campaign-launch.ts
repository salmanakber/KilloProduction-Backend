import { prisma } from "@/lib/prisma"

export type LaunchMarketingCampaignResult =
  | { ok: true; participantCount: number }
  | { ok: false; reason: "not_found" | "bad_status" | "no_audience" | "error"; detail?: string }

async function queueNotification({
  userId,
  campaignId,
  channel,
  content,
  variant,
}: {
  userId: string
  campaignId: string
  channel: string
  content: any
  variant?: string | null
}) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        campaignId,
        title: content?.title || "Notification",
        message: content?.message || "",
        type: "PROMOTION",
        data: {
          channel,
          variant,
          campaignId,
        },
        imageUrl: content?.imageUrl,
        actionUrl: content?.actionUrl,
      },
    })
  } catch (error) {
    console.error("Error queueing notification:", error)
  }
}

/**
 * Shared launch logic for HTTP admin route and BullMQ worker.
 * Idempotent: returns bad_status if campaign is not DRAFT or SCHEDULED.
 */
export async function launchMarketingCampaign(campaignId: string): Promise<LaunchMarketingCampaignResult> {
  try {
    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        CampaignSegments: { select: { A: true } },
        targetAudience: true,
      },
    })

    if (!campaign) {
      return { ok: false, reason: "not_found" }
    }

    if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
      return { ok: false, reason: "bad_status" }
    }

    const fromJoin = campaign.CampaignSegments.map((cs) => cs.A)
    const taSegs = campaign.targetAudience?.segments
    const fromAudience = Array.isArray(taSegs)
      ? taSegs.filter((x): x is string => typeof x === "string")
      : taSegs && typeof taSegs === "object"
        ? Object.values(taSegs as Record<string, unknown>).filter((x): x is string => typeof x === "string")
        : []

    const segmentIds = [...new Set([...fromJoin, ...fromAudience])]

    const memberRows =
      segmentIds.length > 0
        ? await prisma.customerSegmentMember.findMany({
            where: { segmentId: { in: segmentIds }, isActive: true },
            select: { userId: true },
          })
        : []

    const targetUsers = new Set(memberRows.map((m) => m.userId))

    if (targetUsers.size === 0) {
      return { ok: false, reason: "no_audience" }
    }

    const participants = Array.from(targetUsers).map((uid) => ({
      campaignId,
      userId: uid,
      variant: campaign.isABTest ? (Math.random() < 0.5 ? "A" : "B") : null,
    }))

    await prisma.campaignParticipant.createMany({
      data: participants,
      skipDuplicates: true,
    })

    await prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: {
        status: "RUNNING",
        sentAt: new Date(),
        totalSent: participants.length,
      },
    })

    const channelsRaw = campaign.channels as unknown
    const channels = Array.isArray(channelsRaw)
      ? channelsRaw.map(String)
      : channelsRaw && typeof channelsRaw === "object"
        ? Object.values(channelsRaw as object).map(String)
        : []
    const content = (campaign.content || {}) as Record<string, unknown> & {
      title?: string
      message?: string
      imageUrl?: string
      actionUrl?: string
    }

    for (const participant of participants) {
      for (const channel of channels) {
        await queueNotification({
          userId: participant.userId,
          campaignId,
          channel,
          content: (content as any)[channel] || content,
          variant: participant.variant,
        })
      }
    }

    return { ok: true, participantCount: participants.length }
  } catch (e) {
    console.error("launchMarketingCampaign:", e)
    return {
      ok: false,
      reason: "error",
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}
