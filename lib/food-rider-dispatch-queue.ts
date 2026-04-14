import { Queue } from "bullmq"
import Redis from "ioredis"

export const FOOD_RIDER_DISPATCH_QUEUE_NAME = "food-rider-dispatch"

function createConnection(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url || url.length < 5) return null
  return new Redis(url, { maxRetriesPerRequest: null })
}

/**
 * Schedules promotion of FOOD courier booking from AWAITING_PREP → REQUESTED.
 * Returns false when REDIS_URL is unset (checkout should open riders immediately).
 */
export async function scheduleFoodRiderDispatchJob(opts: {
  courierBookingId: string
  orderId: string
  delayMs: number
}): Promise<boolean> {
  const connection = createConnection()
  if (!connection) return false

  try {
    const queue = new Queue(FOOD_RIDER_DISPATCH_QUEUE_NAME, { connection })
    await queue.add(
      "open-for-riders",
      { courierBookingId: opts.courierBookingId, orderId: opts.orderId },
      {
        delay: Math.max(0, opts.delayMs),
        jobId: `food-dispatch-${opts.courierBookingId}`,
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      }
    )
    await queue.close()
    return true
  } finally {
    await connection.quit().catch(() => {})
  }
}
