import { Queue } from "bullmq"
import Redis from "ioredis"

export const MARKETING_SCHEDULED_QUEUE_NAME = "marketing-scheduled"

function createConnection(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url || url.length < 5) return null
  return new Redis(url, { maxRetriesPerRequest: null })
}

export function marketingLaunchJobId(campaignId: string): string {
  return `marketing-launch-${campaignId}`
}

/**
 * Enqueue a delayed launch for a SCHEDULED campaign. Replaces any existing job for the same campaign.
 */
export async function scheduleCampaignLaunchJob(opts: {
  campaignId: string
  delayMs: number
}): Promise<boolean> {
  const connection = createConnection()
  if (!connection) {
    console.warn("[marketing-scheduled-queue] REDIS_URL missing; campaign launch not queued")
    return false
  }

  const jobId = marketingLaunchJobId(opts.campaignId)

  try {
    const queue = new Queue(MARKETING_SCHEDULED_QUEUE_NAME, { connection })
    const existing = await queue.getJob(jobId)
    if (existing) {
      await existing.remove()
    }
    await queue.add(
      "launch-campaign",
      { campaignId: opts.campaignId },
      {
        jobId,
        delay: Math.max(0, opts.delayMs),
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 120_000 },
      }
    )
    await queue.close()
    return true
  } catch (e) {
    console.error("[marketing-scheduled-queue] scheduleCampaignLaunchJob:", e)
    return false
  } finally {
    await connection.quit().catch(() => {})
  }
}

export async function cancelCampaignLaunchJob(campaignId: string): Promise<void> {
  const connection = createConnection()
  if (!connection) return

  try {
    const queue = new Queue(MARKETING_SCHEDULED_QUEUE_NAME, { connection })
    const job = await queue.getJob(marketingLaunchJobId(campaignId))
    if (job) await job.remove()
    await queue.close()
  } catch (e) {
    console.error("[marketing-scheduled-queue] cancelCampaignLaunchJob:", e)
  } finally {
    await connection.quit().catch(() => {})
  }
}
