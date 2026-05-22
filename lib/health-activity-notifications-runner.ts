import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { analyzeWithAI } from "@/lib/ai/queue"
import { AIUseCase } from "@prisma/client"

const DEFAULT_DAILY_STEP_GOAL = 10_000

export type HealthActivityRunResult = {
  dailySummaries: number
  weeklySummaries: number
  monthlySummaries: number
  goalAchievements: number
  activityNudges: number
  todayWalkReports: number
  notificationsSent: number
}

function startOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function dateKey(d = new Date()) {
  return d.toISOString().split("T")[0]
}

async function recentlyNotified(
  userId: string,
  dedupeKey: string,
  withinMs: number
): Promise<boolean> {
  const since = new Date(Date.now() - withinMs)
  const row = await prisma.notification.findFirst({
    where: {
      userId,
      createdAt: { gte: since },
      data: { path: ["healthDedupeKey"], equals: dedupeKey },
    },
    select: { id: true },
  })
  return !!row
}

async function sendHealthNotification(params: {
  userId: string
  title: string
  message: string
  dedupeKey: string
  type?: string
}) {
  if (await recentlyNotified(params.userId, params.dedupeKey, 20 * 60 * 60 * 1000)) {
    return false
  }
  await NotificationBridge.sendNotification({
    userId: params.userId,
    title: params.title,
    message: params.message,
    type: (params.type || "REMINDER") as any,
    module: "PHARMACY",
    data: {
      actionType: "navigate",
      screen: "HealthRecord",
      params: [],
      healthDedupeKey: params.dedupeKey,
    },
  })
  return true
}

const STEP_TRACKING_SOURCES = new Set([
  "apple_health",
  "google_fit",
  "pedometer",
  "activity_session",
])

function stepsFromLogs(logs: { logType: string; value: unknown }[]): number {
  let max = 0
  for (const log of logs) {
    if (log.logType !== "STEPS") continue
    const v = log.value as { count?: number; steps?: number } | null
    const n = Number(v?.count ?? v?.steps ?? 0)
    if (n > max) max = n
  }
  return max
}

function distanceKmFromLogs(logs: { logType: string; value: unknown }[]): number {
  let max = 0
  for (const log of logs) {
    if (log.logType !== "STEPS") continue
    const v = log.value as { distanceKm?: number; distance?: number } | null
    const n = Number(v?.distanceKm ?? v?.distance ?? 0)
    if (n > max) max = n
  }
  return max
}

function logHasStepTrackingSource(log: {
  value: unknown
  notes?: string | null
}): boolean {
  const v = log.value as { source?: string } | null
  const src = String(v?.source || "").toLowerCase()
  if (STEP_TRACKING_SOURCES.has(src)) return true
  const notes = String(log.notes || "").toLowerCase()
  return notes.includes("auto-synced") || notes.includes("workout session")
}

async function userHasStepTrackingEnabled(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recent = await prisma.healthLog.findFirst({
    where: { userId, logType: "STEPS", recordedAt: { gte: since } },
    orderBy: { recordedAt: "desc" },
    select: { value: true, notes: true },
  })
  if (!recent) return false
  return logHasStepTrackingSource(recent)
}

async function generateDailySummaryForUser(userId: string, dayStart: Date, dayEnd: Date) {
  const logs = await prisma.healthLog.findMany({
    where: { userId, recordedAt: { gte: dayStart, lte: dayEnd } },
    orderBy: { recordedAt: "asc" },
  })
  if (logs.length === 0) return null

  const vitals = await prisma.healthVital.findUnique({ where: { userId } })
  const grouped: Record<string, unknown[]> = {}
  for (const log of logs) {
    if (!grouped[log.logType]) grouped[log.logType] = []
    grouped[log.logType].push(log.value)
  }

  const stats: Record<string, unknown> = {}
  for (const [type, values] of Object.entries(grouped)) {
    stats[type] = { count: values.length, values }
  }

  let aiSummary: Record<string, unknown> | null = null
  try {
    const aiResponse = await analyzeWithAI(
      "GENERAL_ANALYSIS" as AIUseCase,
      {
        period: "DAILY",
        userVitals: vitals,
        stats,
        date: dayStart.toISOString().split("T")[0],
      },
      {
        category: "TEXT_TO_TEXT",
        customPrompt: `You are a health assistant. Summarize the user's health and activity data briefly.
Return JSON: { "summary": "One paragraph", "highlights": ["point 1"], "concerns": ["concern"], "score": 0-100 }`,
      }
    )
    if (aiResponse.content) {
      let cleaned = aiResponse.content.trim()
      cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
      const first = cleaned.indexOf("{")
      const last = cleaned.lastIndexOf("}")
      if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
      aiSummary = JSON.parse(cleaned)
    }
  } catch {
    /* optional */
  }

  await prisma.healthSummary.create({
    data: {
      userId,
      period: "DAILY",
      startDate: dayStart,
      endDate: dayEnd,
      summary: {
        stats,
        aiSummary,
        totalEntries: logs.length,
        generatedAt: new Date().toISOString(),
      },
    },
  })

  return { logs, aiSummary, steps: stepsFromLogs(logs) }
}

/**
 * Health activity notifications: daily/weekly/monthly summaries, goal achievements, activity nudges.
 * Called from BullMQ worker tick (and optionally external cron).
 */
export async function runHealthActivityNotificationsJob(): Promise<HealthActivityRunResult> {
  const now = new Date()
  const hour = now.getHours()
  const dayOfWeek = now.getDay()
  const dayOfMonth = now.getDate()

  const result: HealthActivityRunResult = {
    dailySummaries: 0,
    weeklySummaries: 0,
    monthlySummaries: 0,
    goalAchievements: 0,
    activityNudges: 0,
    todayWalkReports: 0,
    notificationsSent: 0,
  }

  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const yesterdayEnd = endOfDay(yesterdayStart)

  // ── Daily summary (8 AM) for users active yesterday ──
  if (hour === 8) {
    const activeUsers = await prisma.healthLog.findMany({
      where: { recordedAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      select: { userId: true },
      distinct: ["userId"],
    })

    for (const { userId } of activeUsers) {
      try {
        const existing = await prisma.healthSummary.findFirst({
          where: {
            userId,
            period: "DAILY",
            startDate: yesterdayStart,
          },
        })
        if (existing) continue

        const summary = await generateDailySummaryForUser(userId, yesterdayStart, yesterdayEnd)
        if (!summary) continue
        result.dailySummaries++

        const highlights = (summary.aiSummary?.highlights as string[] | undefined) || []
        const score = summary.aiSummary?.score as number | undefined
        const message =
          highlights.length > 0
            ? `📊 ${highlights[0]}${score != null ? ` (Health Score: ${score}/100)` : ""}`
            : `📊 You logged ${summary.logs.length} health entries yesterday. Tap to see your summary.`

        if (
          await sendHealthNotification({
            userId,
            title: "🏥 Daily Health Summary",
            message,
            dedupeKey: `daily-summary:${dateKey(yesterdayStart)}`,
            type: "SYSTEM",
          })
        ) {
          result.notificationsSent++
        }

        const concerns = (summary.aiSummary?.concerns as string[] | undefined) || []
        if (concerns.length > 0) {
          if (
            await sendHealthNotification({
              userId,
              title: "⚠️ Health Alert",
              message: `Attention: ${concerns[0]}`,
              dedupeKey: `daily-concern:${dateKey(yesterdayStart)}`,
              type: "SYSTEM",
            })
          ) {
            result.notificationsSent++
          }
        }
      } catch (err) {
        console.error(`[health-activity] daily summary failed for ${userId}:`, err)
      }
    }
  }

  // ── Weekly report (Monday 8 AM) ──
  if (hour === 8 && dayOfWeek === 1) {
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - 7)

    const weeklyUsers = await prisma.healthLog.findMany({
      where: { recordedAt: { gte: weekStart, lte: yesterdayEnd } },
      select: { userId: true },
      distinct: ["userId"],
    })

    for (const { userId } of weeklyUsers) {
      try {
        const existing = await prisma.healthSummary.findFirst({
          where: { userId, period: "WEEKLY", startDate: weekStart },
        })
        if (existing) continue

        const logs = await prisma.healthLog.findMany({
          where: { userId, recordedAt: { gte: weekStart, lte: yesterdayEnd } },
        })
        const weekSteps = stepsFromLogs(logs)

        await prisma.healthSummary.create({
          data: {
            userId,
            period: "WEEKLY",
            startDate: weekStart,
            endDate: yesterdayEnd,
            summary: {
              totalEntries: logs.length,
              totalSteps: weekSteps,
              generatedAt: now.toISOString(),
            },
          },
        })
        result.weeklySummaries++

        if (
          await sendHealthNotification({
            userId,
            title: "📈 Weekly Health Report",
            message: `Your weekly report is ready! ${weekSteps.toLocaleString()} steps and ${logs.length} entries logged.`,
            dedupeKey: `weekly-report:${dateKey(weekStart)}`,
            type: "SYSTEM",
          })
        ) {
          result.notificationsSent++
        }
      } catch (err) {
        console.error(`[health-activity] weekly report failed for ${userId}:`, err)
      }
    }
  }

  // ── Monthly report (1st of month, 8 AM) ──
  if (hour === 8 && dayOfMonth === 1) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    const monthlyUsers = await prisma.healthLog.findMany({
      where: { recordedAt: { gte: monthStart, lte: monthEnd } },
      select: { userId: true },
      distinct: ["userId"],
    })

    for (const { userId } of monthlyUsers) {
      try {
        const existing = await prisma.healthSummary.findFirst({
          where: { userId, period: "MONTHLY", startDate: monthStart },
        })
        if (existing) continue

        const logs = await prisma.healthLog.findMany({
          where: { userId, recordedAt: { gte: monthStart, lte: monthEnd } },
        })

        await prisma.healthSummary.create({
          data: {
            userId,
            period: "MONTHLY",
            startDate: monthStart,
            endDate: monthEnd,
            summary: {
              totalEntries: logs.length,
              totalSteps: stepsFromLogs(logs),
              generatedAt: now.toISOString(),
            },
          },
        })
        result.monthlySummaries++

        if (
          await sendHealthNotification({
            userId,
            title: "📅 Monthly Health Overview",
            message: `Your monthly health overview is ready with ${logs.length} logged entries.`,
            dedupeKey: `monthly-report:${monthStart.toISOString().slice(0, 7)}`,
            type: "SYSTEM",
          })
        ) {
          result.notificationsSent++
        }
      } catch (err) {
        console.error(`[health-activity] monthly report failed for ${userId}:`, err)
      }
    }
  }

  // ── Goal achievement (check today's steps, any hour) ──
  const todayStepUsers = await prisma.healthLog.findMany({
    where: { logType: "STEPS", recordedAt: { gte: todayStart, lte: todayEnd } },
    select: { userId: true, value: true },
  })

  const stepsByUser = new Map<string, number>()
  for (const row of todayStepUsers) {
    const v = row.value as { count?: number; steps?: number } | null
    const n = Number(v?.count ?? v?.steps ?? 0)
    stepsByUser.set(row.userId, Math.max(stepsByUser.get(row.userId) ?? 0, n))
  }

  for (const [userId, steps] of stepsByUser) {
    if (steps < DEFAULT_DAILY_STEP_GOAL) continue
    try {
      if (
        await sendHealthNotification({
          userId,
          title: "🎯 Step Goal Achieved!",
          message: `Congratulations! You hit ${steps.toLocaleString()} steps today. Keep the momentum going!`,
          dedupeKey: `goal-steps:${dateKey(todayStart)}`,
          type: "REMINDER",
        })
      ) {
        result.goalAchievements++
        result.notificationsSent++
      }
    } catch (err) {
      console.error(`[health-activity] goal notify failed for ${userId}:`, err)
    }
  }

  // ── Evening walk report (8 PM) for users with background step tracking ──
  if (hour === 20) {
    for (const [userId, steps] of stepsByUser) {
      if (steps < 100) continue
      try {
        const trackingOn = await userHasStepTrackingEnabled(userId)
        if (!trackingOn) continue

        const settings = await prisma.userSettings.findUnique({
          where: { userId },
          select: { pushNotifications: true },
        })
        if (settings?.pushNotifications === false) continue

        const todayLogs = await prisma.healthLog.findMany({
          where: {
            userId,
            logType: "STEPS",
            recordedAt: { gte: todayStart, lte: todayEnd },
          },
        })
        const distanceKm = distanceKmFromLogs(todayLogs)
        const dedupeKey = `today-walk-report:${dateKey(todayStart)}`

        if (await recentlyNotified(userId, dedupeKey, 20 * 60 * 60 * 1000)) continue

        await NotificationBridge.sendHealthWalkDailyReport({
          userId,
          steps,
          distanceKm,
          dedupeKey,
        })
        result.todayWalkReports++
        result.notificationsSent++
      } catch (err) {
        console.error(`[health-activity] walk report failed for ${userId}:`, err)
      }
    }
  }

  // ── Evening nudge (6 PM) if low activity today ──
  if (hour === 18) {
    const healthUsers = await prisma.healthVital.findMany({ select: { userId: true } })
    for (const { userId } of healthUsers) {
      const steps = stepsByUser.get(userId) ?? 0
      if (steps >= 5000) continue
      try {
        if (
          await sendHealthNotification({
            userId,
            title: "🚶 Daily Activity Reminder",
            message:
              steps > 0
                ? `You have ${steps.toLocaleString()} steps so far. A short walk can help you reach your daily goal!`
                : "Start tracking your activity today — even a 10-minute walk makes a difference!",
            dedupeKey: `activity-nudge:${dateKey(todayStart)}`,
            type: "REMINDER",
          })
        ) {
          result.activityNudges++
          result.notificationsSent++
        }
      } catch (err) {
        console.error(`[health-activity] nudge failed for ${userId}:`, err)
      }
    }
  }

  return result
}
