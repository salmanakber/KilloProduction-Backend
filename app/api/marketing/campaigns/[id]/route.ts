import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import type { CampaignStatus } from "@prisma/client"
import { syncCampaignScheduledLaunch } from "@/lib/sync-campaign-launch-queue"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: campaignId } = await Promise.resolve(params)
    const body = await request.json()
    const { schedule, startDate, endDate, timezone, status } = body as {
      schedule?: Record<string, unknown>
      startDate?: string | null
      endDate?: string | null
      timezone?: string
      status?: CampaignStatus
    }

    const existing = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } })
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (schedule !== undefined) data.schedule = schedule
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null
    if (timezone !== undefined) data.timezone = timezone
    if (status !== undefined) data.status = status

    const updated = await prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: data as any,
    })

    await syncCampaignScheduledLaunch(campaignId).catch((e) =>
      console.error("[marketing/campaigns PATCH] syncCampaignScheduledLaunch:", e)
    )

    return NextResponse.json({ success: true, campaign: updated })
  } catch (e) {
    console.error("PATCH /marketing/campaigns/[id]:", e)
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 })
  }
}
