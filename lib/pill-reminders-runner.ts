import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"

function getFrequencyEmoji(frequency: string): string {
  const f = (frequency || "").toLowerCase()
  if (f.includes("morning") || f.includes("once")) return "🌅"
  if (f.includes("evening") || f.includes("night")) return "🌙"
  return "💊"
}

export type PillRemindersRunResult = {
  remindersChecked: number
  notificationsSent: number
  expiredDeactivated: number
}

/**
 * Core logic for pill reminders (used by `/api/cron/pill-reminders` and the BullMQ worker tick).
 */
export async function runPillRemindersJob(): Promise<PillRemindersRunResult> {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  const reminders = await prisma.medicineReminder.findMany({
    where: {
      isActive: true,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  })

  let notificationsSent = 0
  let remindersChecked = 0

  for (const reminder of reminders) {
    remindersChecked++

    const times: string[] = Array.isArray(reminder.times) ? reminder.times : []

    let shouldNotify = false

    if (times.length > 0) {
      for (const time of times) {
        const [h, m] = time.split(":").map(Number)
        if (!isNaN(h) && !isNaN(m)) {
          const timeDiff = Math.abs(currentHour * 60 + currentMinute - (h * 60 + m))
          if (timeDiff <= 30) {
            shouldNotify = true
            break
          }
        }
      }
    } else {
      const freq = (reminder.frequency || "").toLowerCase()
      if (freq.includes("once") || freq === "1x" || freq === "daily") {
        shouldNotify = currentHour === 8
      } else if (freq.includes("twice") || freq === "2x") {
        shouldNotify = currentHour === 8 || currentHour === 20
      } else if (freq.includes("three") || freq === "3x" || freq.includes("thrice")) {
        shouldNotify = currentHour === 8 || currentHour === 14 || currentHour === 20
      } else if (freq.includes("four") || freq === "4x") {
        shouldNotify =
          currentHour === 8 || currentHour === 12 || currentHour === 18 || currentHour === 22
      } else {
        shouldNotify = currentHour === 8
      }
    }

    if (!shouldNotify) continue

    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const recentNotification = await prisma.notification.findFirst({
      where: {
        userId: reminder.userId,
        type: "MEDICINE_REMINDER" as any,
        data: { path: ["reminderId"], equals: reminder.id },
        createdAt: { gte: oneHourAgo },
      },
    })

    if (recentNotification) continue

    try {
      const emoji = getFrequencyEmoji(reminder.frequency)
      await NotificationBridge.sendNotification({
        userId: reminder.userId,
        title: `${emoji} Time to take your medicine`,
        message: `Remember to take ${reminder.medicineName} (${reminder.dosage})`,
        type: "MEDICINE_REMINDER" as any,
        module: "PHARMACY",
        data: {
          actionType: "navigate",
          screen: "HealthRecord",
          params: [],
          reminderId: reminder.id,
          medicineName: reminder.medicineName,
          dosage: reminder.dosage,
        },
      })
      notificationsSent++
    } catch (err) {
      console.error(`Failed to send pill reminder for ${reminder.id}:`, err)
    }
  }

  const expiredReminders = await prisma.medicineReminder.findMany({
    where: {
      isActive: true,
      endDate: { lt: now },
    },
  })

  let deactivated = 0
  for (const expired of expiredReminders) {
    await prisma.medicineReminder.update({
      where: { id: expired.id },
      data: { isActive: false },
    })
    deactivated++

    await NotificationBridge.sendNotification({
      userId: expired.userId,
      title: "✅ Medication Course Complete",
      message: `Your ${expired.medicineName} course has ended. If you need to continue, please update your reminder.`,
      type: "MEDICINE_REMINDER" as any,
      module: "PHARMACY",
      data: {
        actionType: "navigate",
        screen: "HealthRecord",
        params: [],
        reminderId: expired.id,
      },
    })
    notificationsSent++
  }

  return {
    remindersChecked,
    notificationsSent,
    expiredDeactivated: deactivated,
  }
}
