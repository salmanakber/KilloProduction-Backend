import { prisma } from "@/lib/prisma"
import { cancelCampaignLaunchJob, scheduleCampaignLaunchJob } from "@/lib/marketing-scheduled-queue"

/**
 * Keeps BullMQ in sync with DB: one delayed job per SCHEDULED campaign with a future startDate.
 * Starts in the past or within a few seconds rely on catch-up (worker) to launch.
 */
export async function syncCampaignScheduledLaunch(campaignId: string): Promise<void> {
  const c = await prisma.marketingCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true, startDate: true },
  })

  if (!c) {
    await cancelCampaignLaunchJob(campaignId)
    return
  }

  if (c.status !== "SCHEDULED" || !c.startDate) {
    await cancelCampaignLaunchJob(campaignId)
    return
  }

  const rawDelay = c.startDate.getTime() - Date.now()
  if (rawDelay <= 0) {
    await cancelCampaignLaunchJob(campaignId)
    return
  }

  await scheduleCampaignLaunchJob({ campaignId: c.id, delayMs: rawDelay })
}
