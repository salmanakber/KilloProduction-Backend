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

/**
 * At `scheduledAt`, worker opens rider dispatch (waves + socket), same as immediate ride booking.
 * Job id is stable so re-enqueue replaces the delayed job for the same booking.
 */
export async function scheduleScheduledRideDispatchJob(opts: {
  rideBookingId: string
  delayMs: number
}): Promise<boolean> {
  const connection = createConnection()
  if (!connection) return false

  try {
    const queue = new Queue(FOOD_RIDER_DISPATCH_QUEUE_NAME, { connection })
    await queue.add(
      "scheduled-ride-dispatch",
      { rideBookingId: opts.rideBookingId },
      {
        delay: Math.max(0, opts.delayMs),
        jobId: `scheduled-ride-${opts.rideBookingId}`,
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

/**
 * Deferred dispatch for `CourierBooking` when `scheduledAt` is in the future (non-food checkout flow).
 */
export async function scheduleScheduledCourierDispatchJob(opts: {
  courierBookingId: string
  delayMs: number
}): Promise<boolean> {
  const connection = createConnection()
  if (!connection) return false

  try {
    const queue = new Queue(FOOD_RIDER_DISPATCH_QUEUE_NAME, { connection })
    await queue.add(
      "scheduled-courier-dispatch",
      { courierBookingId: opts.courierBookingId },
      {
        delay: Math.max(0, opts.delayMs),
        jobId: `scheduled-courier-${opts.courierBookingId}`,
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
