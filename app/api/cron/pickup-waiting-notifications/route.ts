import { type NextRequest, NextResponse } from "next/server"
import { runPickupWaitingJobs } from "@/lib/pickup-waiting"

/**
 * Optional HTTP cron: pickup-waiting grace warnings, accrual, charge-started pushes, sockets (`runPickupWaitingJobs`, same tick as `food-rider-dispatch-worker`).
 * Production: use `PICKUP_WAITING_NOTIFY_TICK_MS` in the worker instead of this route.
 * Configure with Authorization: Bearer CRON_SECRET (optional if CRON_SECRET unset).
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const stats = await runPickupWaitingJobs()

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error"
    console.error("pickup-waiting-notifications cron:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
