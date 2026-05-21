import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"

export type HealthDietRunResult = {
  mealReminders: number
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

async function recentlyNotified(userId: string, dedupeKey: string): Promise<boolean> {
  const since = new Date(Date.now() - 22 * 60 * 60 * 1000)
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

/** Send push reminders ~15 minutes before scheduled meals on active diet plans */
export async function runHealthDietMealRemindersJob(): Promise<HealthDietRunResult> {
  const result: HealthDietRunResult = { mealReminders: 0, notificationsSent: 0 }
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const today = dateKey(now)

  const plans = await prisma.healthDietPlan.findMany({
    where: { isActive: true, remindersEnabled: true },
    select: { id: true, userId: true, title: true, meals: true },
    take: 500,
  })

  for (const plan of plans) {
    const meals = Array.isArray(plan.meals) ? (plan.meals as any[]) : []
    for (const meal of meals) {
      const mealMinutes = parseTimeToMinutes(meal?.time)
      if (mealMinutes == null) continue

      const diff = mealMinutes - nowMinutes
      // Remind 10–20 minutes before meal (window for hourly worker tick)
      if (diff < 10 || diff > 20) continue

      const dedupeKey = `diet_meal_${today}_${plan.id}_${meal.id || meal.mealType}_${meal.time}`
      if (await recentlyNotified(plan.userId, dedupeKey)) continue

      const mealLabel = String(meal.name || meal.mealType || "meal")
      const sent = await NotificationBridge.sendNotification({
        userId: plan.userId,
        title: `🍽 Meal reminder — ${mealLabel}`,
        message: `It's almost time for ${mealLabel}${meal.calories ? ` (~${meal.calories} kcal)` : ""}. ${meal.notes || "Stay on track with your diet plan!"}`,
        type: "REMINDER" as any,
        module: "PHARMACY",
        data: {
          actionType: "navigate",
          screen: "HealthRecord",
          params: [{ tab: "vitals" }],
          healthDedupeKey: dedupeKey,
          mealType: meal.mealType,
          planId: plan.id,
        },
      }).then(() => true).catch(() => false)

      result.mealReminders += 1
      if (sent) result.notificationsSent += 1
    }
  }

  return result
}

/** Morning daily dietary advice notification (8 AM local server time approximation) */
export async function runHealthDietMorningAdviceJob(): Promise<number> {
  const hour = new Date().getHours()
  if (hour !== 8) return 0

  let sent = 0
  const plans = await prisma.healthDietPlan.findMany({
    where: { isActive: true },
    select: { userId: true, dailyAdvice: true, title: true },
    take: 500,
  })

  const today = dateKey()
  for (const plan of plans) {
    const advice = plan.dailyAdvice as any
    const adviceDate = advice?.generatedAt ? dateKey(new Date(advice.generatedAt)) : null
    if (adviceDate === today && advice?.headline) {
      const dedupeKey = `diet_advice_${today}_${plan.userId}`
      if (await recentlyNotified(plan.userId, dedupeKey)) continue

      await NotificationBridge.sendNotification({
        userId: plan.userId,
        title: advice.headline || "Today's dietary guide",
        message: advice.summary || "Open Health to see your personalized meal guidance.",
        type: "REMINDER" as any,
        module: "PHARMACY",
        data: {
          actionType: "navigate",
          screen: "HealthRecord",
          healthDedupeKey: dedupeKey,
        },
      }).catch(() => {})
      sent += 1
    }
  }
  return sent
}
