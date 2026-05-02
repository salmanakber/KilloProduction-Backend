import { prisma } from "@/lib/prisma"
import { launchMarketingCampaign } from "@/lib/marketing-campaign-launch"

/**
 * Safety net when Redis was down or a delayed job was lost: launches SCHEDULED campaigns past startDate.
 */
export async function catchUpOverdueScheduledCampaigns(): Promise<{ attempted: number; launched: number }> {
  const now = new Date()
  const candidates = await prisma.marketingCampaign.findMany({
    where: {
      status: { in: ["SCHEDULED", "RUNNING"] },
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    select: { id: true, sentAt: true, schedule: true, status: true },
  })

  const due: Array<{ id: string }> = []
  for (const c of candidates) {
    const schedule =
      c.schedule && typeof c.schedule === "object" ? (c.schedule as Record<string, unknown>) : {}
    const frequency = String(schedule.frequency || "ONCE").toUpperCase()
    if (frequency === "ONCE") {
      if (c.status === "SCHEDULED") due.push({ id: c.id })
      continue
    }

    const last = c.sentAt?.getTime() ?? 0
    const nowMs = now.getTime()
    let intervalMs = 24 * 60 * 60 * 1000
    if (frequency === "HOURLY") intervalMs = 60 * 60 * 1000
    if (frequency === "CUSTOM_DAYS") {
      const everyDays = Math.max(1, Number(schedule.customEveryDays || 1))
      intervalMs = everyDays * 24 * 60 * 60 * 1000
    }
    if (!last || nowMs - last >= intervalMs) {
      due.push({ id: c.id })
    }
  }

  let launched = 0
  for (const row of due) {
    const r = await launchMarketingCampaign(row.id)
    if (r.ok) launched++
  }

  return { attempted: due.length, launched }
}
