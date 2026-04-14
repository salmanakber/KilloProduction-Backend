import { prisma } from "@/lib/prisma"
import { scheduleMealPlanRecurringJob } from "@/lib/meal-plan-recurring-queue"

export async function processMealPlanRecurringJob(data: { planId: string }): Promise<void> {
  const plan = await prisma.savedMealPlan.findUnique({
    where: { id: data.planId },
  })

  if (!plan || !plan.isActive || !plan.recurrenceIntervalDays || plan.recurrenceIntervalDays < 1) {
    return
  }

  const intervalMs = plan.recurrenceIntervalDays * 24 * 60 * 60 * 1000
  const now = new Date()

  await prisma.notification.create({
    data: {
      userId: plan.userId,
      title: "Meal plan reminder",
      message: `Time to shop “${plan.title}” — open Smart Shop and tap your saved plan to add items to your cart.`,
      type: "REMINDER",
      module: plan.module,
      data: {
        mealPlanId: plan.id,
        module: plan.module,
        screenHint: "ModuleSmartShop",
      } as object,
    },
  })

  await prisma.savedMealPlan.update({
    where: { id: plan.id },
    data: {
      lastReminderAt: now,
      nextRunAt: new Date(now.getTime() + intervalMs),
    },
  })

  const queued = await scheduleMealPlanRecurringJob({
    planId: plan.id,
    delayMs: intervalMs,
  })
  if (!queued) {
    console.warn("[meal-plan-recurring] REDIS_URL missing; could not chain next reminder")
  }
}
