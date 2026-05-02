import { prisma } from "@/lib/prisma"
import { executeAdminNotificationCampaignSend } from "@/lib/execute-admin-notification-campaign"

/**
 * Sends admin system notices whose {@link NotificationCampaign.scheduledAt} is in the past
 * and status is still SCHEDULED. Intended to run on a short interval from the BullMQ worker process.
 */
export async function processDueNotificationBroadcasts(): Promise<{
  attempted: number
  launched: number
}> {
  const now = new Date()

  const due = await prisma.notificationCampaign.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  })

  let launched = 0
  for (const row of due) {
    const r = await executeAdminNotificationCampaignSend(row.id)
    if (r.ok && r.delivered > 0) launched += 1
  }

  return { attempted: due.length, launched }
}
