import { prisma } from "@/lib/prisma"
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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
          routeName: (content as Record<string, unknown>)?.routeName,
          promoCode: (content as Record<string, unknown>)?.promoCode,
          actionUrl: content?.actionUrl,
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

    const scheduleObj =
      campaign.schedule && typeof campaign.schedule === "object"
        ? (campaign.schedule as Record<string, unknown>)
        : {}
    const frequency = String(scheduleObj.frequency || "ONCE").toUpperCase()

    if (!["DRAFT", "SCHEDULED", "RUNNING"].includes(campaign.status)) {
      return { ok: false, reason: "bad_status" }
    }
    if (campaign.status === "RUNNING" && frequency === "ONCE") {
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

    const memberRows = segmentIds.length > 0
      ? await prisma.customerSegmentMember.findMany({
          where: { segmentId: { in: segmentIds }, isActive: true },
          select: { userId: true },
        })
      : await prisma.user.findMany({
          where: { role: "CUSTOMER" },
          select: { id: true },
        }).then((rows) => rows.map((r) => ({ userId: r.id })))

    const targeting =
      campaign.content && typeof campaign.content === "object"
        ? ((campaign.content as Record<string, unknown>).targeting as Record<string, unknown> | undefined)
        : undefined
    const targetingCoordinates =
      campaign.content && typeof campaign.content === "object"
        ? ((campaign.content as Record<string, unknown>).targetingCoordinates as
            | Record<string, unknown>
            | undefined)
        : undefined
    const locationTargets = Array.isArray(targeting?.location)
      ? targeting.location.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
      : []

    let usersFromMembers = memberRows.map((m) => m.userId)
    if ((locationTargets.length > 0 || targetingCoordinates) && usersFromMembers.length > 0) {
      const profiles = await prisma.userProfile.findMany({
        where: { userId: { in: usersFromMembers } },
        select: { userId: true, city: true, country: true, latitude: true, longitude: true },
      })

      const targetLat = Number(targetingCoordinates?.lat)
      const targetLng = Number(targetingCoordinates?.lng)
      const targetRadiusKm = Math.max(1, Number(targetingCoordinates?.radiusKm || 10))
      const hasGeoTarget = Number.isFinite(targetLat) && Number.isFinite(targetLng)

      const allowed = new Set(
        profiles
          .filter((p) => {
            if (hasGeoTarget) {
              if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return false
              return haversineKm(targetLat, targetLng, p.latitude as number, p.longitude as number) <= targetRadiusKm
            }
            const comp = `${(p.city || "").toLowerCase()} ${(p.country || "").toLowerCase()}`
            return locationTargets.some((needle) => comp.includes(needle))
          })
          .map((p) => p.userId)
      )
      usersFromMembers = usersFromMembers.filter((id) => allowed.has(id))
    }

    const targetUsers = new Set(usersFromMembers)

    if (targetUsers.size === 0) {
      return { ok: false, reason: "no_audience" }
    }

    const candidateIds = Array.from(targetUsers)
    const existingParticipants = await prisma.campaignParticipant.findMany({
      where: {
        campaignId,
        userId: { in: candidateIds },
      },
      select: { userId: true },
    })
    const existingSet = new Set(existingParticipants.map((r) => r.userId))

    const participants = candidateIds
      .filter((uid) => !existingSet.has(uid))
      .map((uid) => ({
      campaignId,
      userId: uid,
      variant: campaign.isABTest ? (Math.random() < 0.5 ? "A" : "B") : null,
    }))

    if (participants.length > 0) {
      await prisma.campaignParticipant.createMany({
        data: participants,
        skipDuplicates: true,
      })
    }

    await prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: {
        status: "RUNNING",
        sentAt: new Date(),
        totalSent: { increment: participants.length },
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

    if (participants.length > 0) {
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
