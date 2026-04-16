import { prisma } from "@/lib/prisma"
import { launchMarketingCampaign } from "@/lib/marketing-campaign-launch"

/**
 * Safety net when Redis was down or a delayed job was lost: launches SCHEDULED campaigns past startDate.
 */
export async function catchUpOverdueScheduledCampaigns(): Promise<{ attempted: number; launched: number }> {
  const now = new Date()
  const overdue = await prisma.marketingCampaign.findMany({
    where: {
      status: "SCHEDULED",
      startDate: { lte: now },
    },
    select: { id: true },
  })

  let launched = 0
  for (const row of overdue) {
    const r = await launchMarketingCampaign(row.id)
    if (r.ok) launched++
  }

  return { attempted: overdue.length, launched }
}
