import { Queue } from "bullmq"
import Redis from "ioredis"

export const MEAL_PLAN_RECURRING_QUEUE_NAME = "meal-plan-recurring"

function createConnection(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url || url.length < 5) return null
  return new Redis(url, { maxRetriesPerRequest: null })
}

/**
 * After `recurrenceIntervalDays`, remind the user to shop the plan again (notification + chain next job).
 */
export async function scheduleMealPlanRecurringJob(opts: {
  planId: string
  delayMs: number
}): Promise<boolean> {
  const connection = createConnection()
  if (!connection) return false

  try {
    const queue = new Queue(MEAL_PLAN_RECURRING_QUEUE_NAME, { connection })
    await queue.add(
      "remind",
      { planId: opts.planId },
      {
        delay: Math.max(0, opts.delayMs),
        jobId: `meal-plan-${opts.planId}-${Date.now()}`,
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 120_000 },
      }
    )
    await queue.close()
    return true
  } finally {
    await connection.quit().catch(() => {})
  }
}
