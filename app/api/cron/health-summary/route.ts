import { NextRequest, NextResponse } from "next/server"
import { runHealthActivityNotificationsJob } from "@/lib/health-activity-notifications-runner"

/**
 * CRON: Health activity notifications (daily/weekly/monthly summaries, goals, nudges).
 * Also runs on an interval from food-rider-dispatch-worker when REDIS_URL is set.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await runHealthActivityNotificationsJob()

    return NextResponse.json({
      success: true,
      stats: result,
    })
  } catch (error: any) {
    console.error("Health summary cron error:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
