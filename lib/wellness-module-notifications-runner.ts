import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { analyzeWithAI } from "@/lib/ai/queue"
import { AIUseCase } from "@prisma/client"
import {
  listUsersWithWellnessReminders,
  mergeSleepConfig,
  mergeWaterConfig,
  mergeWalkConfig,
} from "@/lib/wellness-module-service"

export type WellnessNotificationRunResult = {
  hydrationReminders: number
  sleepReminders: number
  walkNudges: number
  notificationsSent: number
}

function dateKey(d = new Date()) {
  return d.toISOString().split("T")[0]
}

function parseTimeToMinutes(time: string): number | null {
  const m = String(time || "").match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

async function recentlyNotified(userId: string, dedupeKey: string, withinMs = 55 * 60 * 1000): Promise<boolean> {
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

function startOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

async function waterGlassesToday(userId: string): Promise<number> {
  const todayStart = startOfDay()
  const logs = await prisma.healthLog.findMany({
    where: { userId, logType: "WATER_INTAKE", recordedAt: { gte: todayStart } },
  })
  let total = 0
  for (const log of logs) {
    const v = log.value as { glasses?: number; ml?: number } | null
    total += Number(v?.glasses ?? (v?.ml ? Math.round(v.ml / 250) : 0) ?? 0)
  }
  return total
}

async function todaySteps(userId: string): Promise<number> {
  const todayStart = startOfDay()
  const logs = await prisma.healthLog.findMany({
    where: { userId, logType: "STEPS", recordedAt: { gte: todayStart } },
  })
  let max = 0
  for (const log of logs) {
    const v = log.value as { count?: number; steps?: number } | null
    max = Math.max(max, Number(v?.count ?? v?.steps ?? 0))
  }
  return max
}

async function contextualHydrationMessage(params: {
  userId: string
  glasses: number
  goal: number
  hour: number
}): Promise<string> {
  try {
    const ai = await analyzeWithAI(
      "GENERAL_ANALYSIS" as AIUseCase,
      params,
      {
        category: "TEXT_TO_TEXT",
        customPrompt: `Write ONE short push notification body (max 120 chars) for hydration reminder.
User has ${params.glasses}/${params.goal} glasses, hour=${params.hour}. Be motivational, include emoji optionally.
Return JSON: { "message": "..." }`,
        maxTokens: 150,
      }
    )
    const parsed = ai.content ? JSON.parse(ai.content.replace(/^```json|```$/g, "").trim()) : null
    if (parsed?.message) return String(parsed.message)
  } catch {
    /* fallback */
  }
  const remaining = Math.max(0, params.goal - params.glasses)
  if (remaining <= 2 && remaining > 0) {
    return `You're only ${remaining} glass${remaining > 1 ? "es" : ""} away from today's goal 💧`
  }
  if (params.glasses < params.goal / 2) {
    return "Hydration levels are low — take a quick water break now 💧"
  }
  return "Time for your next hydration break 💧"
}

function shouldSendHydrationReminder(
  config: ReturnType<typeof mergeWaterConfig>,
  nowMinutes: number,
  glasses: number,
  hour: number
): boolean {
  if (!config.remindersEnabled) return false
  if (glasses >= config.dailyGoalGlasses) return false
  if (hour < 7 || hour > 22) return false

  if (config.frequencyMode === "half_hourly") {
    const interval = config.intervalMinutes || 30
    return nowMinutes % interval < 8
  }
  if (config.frequencyMode === "hourly") {
    const interval = config.intervalMinutes || 60
    return nowMinutes % interval < 8
  }
  if (config.frequencyMode === "split_day") {
    const morningTarget = config.morningTarget ?? Math.ceil(config.dailyGoalGlasses / 2)
    const afternoonStart = 12 * 60
    if (nowMinutes < afternoonStart && glasses < morningTarget && hour >= 9 && hour <= 11) return true
    if (nowMinutes >= afternoonStart && glasses < config.dailyGoalGlasses && hour >= 15 && hour <= 20) return true
    return false
  }
  // custom interval
  const interval = config.intervalMinutes || 120
  return nowMinutes % interval < 8
}

function shouldSendSleepReminder(
  config: ReturnType<typeof mergeSleepConfig>,
  nowMinutes: number
): boolean {
  if (!config.remindersEnabled) return false
  const bedtime = parseTimeToMinutes(config.bedtimeTarget)
  if (bedtime == null) return false
  const remindAt = bedtime - (config.reminderMinutesBefore || 30)
  const diff = remindAt - nowMinutes
  return diff >= 0 && diff <= 8
}

/**
 * Smart wellness notifications: hydration intervals, bedtime prep, inactivity nudges.
 * Runs from BullMQ worker tick (food-rider-dispatch-worker).
 */
export async function runWellnessModuleNotificationsJob(): Promise<WellnessNotificationRunResult> {
  const result: WellnessNotificationRunResult = {
    hydrationReminders: 0,
    sleepReminders: 0,
    walkNudges: 0,
    notificationsSent: 0,
  }

  const now = new Date()
  const hour = now.getHours()
  const nowMinutes = hour * 60 + now.getMinutes()
  const today = dateKey(now)

  const profiles = await listUsersWithWellnessReminders()

  for (const profile of profiles) {
    if (profile.user?.userSettings?.pushNotifications === false) continue

    const userId = profile.userId
    const waterConfig = mergeWaterConfig(profile.waterConfig)
    const sleepConfig = mergeSleepConfig(profile.sleepConfig)
    const walkConfig = mergeWalkConfig(profile.walkConfig)

    // ── Hydration reminders ──
    if (waterConfig.remindersEnabled) {
      const glasses = await waterGlassesToday(userId)
      if (shouldSendHydrationReminder(waterConfig, nowMinutes, glasses, hour)) {
        const slotKey = `wellness-water:${today}:${Math.floor(nowMinutes / (waterConfig.intervalMinutes || 60))}`
        if (!(await recentlyNotified(userId, slotKey))) {
          const message = await contextualHydrationMessage({
            userId,
            glasses,
            goal: waterConfig.dailyGoalGlasses,
            hour,
          })
          await NotificationBridge.sendWellnessHydrationReminder({
            userId,
            message,
            glasses,
            goal: waterConfig.dailyGoalGlasses,
            dedupeKey: slotKey,
          })
          result.hydrationReminders++
          result.notificationsSent++
        }
      }
    }

    // ── Sleep / bedtime reminders ──
    if (sleepConfig.remindersEnabled && shouldSendSleepReminder(sleepConfig, nowMinutes)) {
      const dedupeKey = `wellness-sleep:${today}`
      if (!(await recentlyNotified(userId, dedupeKey, 20 * 60 * 60 * 1000))) {
        const mins = sleepConfig.reminderMinutesBefore || 30
        await NotificationBridge.sendWellnessSleepReminder({
          userId,
          message:
            mins >= 30
              ? `Your ideal bedtime starts in ${mins} minutes — prepare for optimal recovery tonight.`
              : "Avoid screen time now to improve sleep quality.",
          dedupeKey,
          bedtimeTarget: sleepConfig.bedtimeTarget,
        })
        result.sleepReminders++
        result.notificationsSent++
      }
    }

    // ── Walk inactivity nudge (mid-day & afternoon) ──
    if (walkConfig.remindersEnabled && (hour === 14 || hour === 17)) {
      const steps = await todaySteps(userId)
      if (steps < 4000) {
        const dedupeKey = `wellness-walk-nudge:${today}:${hour}`
        if (!(await recentlyNotified(userId, dedupeKey, 3 * 60 * 60 * 1000))) {
          await NotificationBridge.sendWellnessWalkNudge({
            userId,
            message:
              steps > 0
                ? `You've been inactive for a while — ${steps.toLocaleString()} steps so far. Try a quick stretch or short walk.`
                : "You've been inactive today — a 10-minute walk can boost your energy.",
            steps,
            dedupeKey,
          })
          result.walkNudges++
          result.notificationsSent++
        }
      }
    }
  }

  return result
}
