import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { getMoneyTransferFxRate } from "@/lib/money-fx-rate"
import { MoneyScheduleFrequency } from "@prisma/client"
import { purchaseVtpassService } from "@/lib/vtpass-purchase"
import type { VtpassServiceType } from "@/lib/vtpass"

function isMissingTableError(error: unknown): boolean {
  const e = error as any
  return e?.code === "P2021"
}

function addInterval(date: Date, frequency: MoneyScheduleFrequency): Date {
  const d = new Date(date.getTime())
  switch (frequency) {
    case "DAILY":
      d.setDate(d.getDate() + 1)
      return d
    case "WEEKLY":
      d.setDate(d.getDate() + 7)
      return d
    case "MONTHLY":
      d.setMonth(d.getMonth() + 1)
      return d
    case "ONCE":
    default:
      return d
  }
}

/**
 * Fires due scheduled money transfers: notifies the owner to open the app and pay.
 * Does not auto-charge cards (no stored payment method in this flow).
 */
export async function processMoneyScheduledDue(): Promise<{ processed: number }> {
  const now = new Date()
  let due: any[] = []
  try {
    due = await prisma.moneyScheduledTransfer.findMany({
      where: {
        status: "ACTIVE",
        nextRunAt: { lte: now },
      },
      take: 50,
      include: {
        receiver: { select: { name: true, email: true, phone: true } },
      },
      // receiver may be null for VTpass schedules
    })
  } catch (e) {
    if (isMissingTableError(e)) {
      console.warn("processMoneyScheduledDue: table missing, skipping")
      return { processed: 0 }
    }
    throw e
  }

  let processed = 0
  for (const s of due) {
    const isVtpass = s.scheduleKind && s.scheduleKind !== "P2P_TRANSFER"

    if (isVtpass && s.servicePayload) {
      try {
        const payload = s.servicePayload as Record<string, string>
        const typeMap: Record<string, VtpassServiceType> = {
          VTPASS_AIRTIME: "airtime",
          VTPASS_DATA: "data",
          VTPASS_ELECTRICITY: "electricity",
          VTPASS_CABLE: "cable",
        }
        const serviceType = typeMap[s.scheduleKind] || "airtime"
        await purchaseVtpassService({
          userId: s.userId,
          serviceType,
          serviceId: payload.serviceId,
          billersCode: payload.billersCode,
          amount: s.amount,
          phone: payload.phone,
          variationCode: payload.variationCode,
          scheduleId: s.id,
        })
        await NotificationBridge.sendNotification({
          userId: s.userId,
          title: "Scheduled bill paid",
          message: `Your scheduled ${serviceType} payment of ₦${s.amount} was processed.`,
          type: "SYSTEM",
          module: "MONEY_TRANSFER",
        })
      } catch (e) {
        console.error("processMoneyScheduledDue vtpass", s.id, e)
        await NotificationBridge.sendNotification({
          userId: s.userId,
          title: "Scheduled bill failed",
          message: `Could not complete scheduled payment: ${e instanceof Error ? e.message : "Error"}`,
          type: "SYSTEM",
          module: "MONEY_TRANSFER",
        })
      }
    } else if (s.receiver) {
      const label = s.receiver.name || s.receiver.email || s.receiver.phone || "recipient"
      try {
        await NotificationBridge.sendNotification({
          userId: s.userId,
          title: "Scheduled transfer due",
          message: `Time to send ${s.currency} ${s.amount} to ${label}. Open Money to complete your transfer.`,
          type: "SYSTEM",
          module: "MONEY_TRANSFER",
          data: {
            actionType: "navigate",
            screen: "SendMoney",
            params: [
              { name: "amount", value: String(s.amount) },
              { name: "receiver", value: { id: s.receiverId } },
            ],
          },
          actionUrl: `/money-app`,
        })
      } catch (e) {
        console.error("processMoneyScheduledDue notify", s.id, e)
      }
    }

    const lastRun = new Date()
    if (s.frequency === "ONCE") {
      try {
        await prisma.moneyScheduledTransfer.update({
          where: { id: s.id },
          data: {
            status: "COMPLETED",
            lastRunAt: lastRun,
          },
        })
      } catch (e) {
        if (!isMissingTableError(e)) throw e
      }
    } else {
      let next = addInterval(lastRun, s.frequency)
      while (next <= now) {
        next = addInterval(next, s.frequency)
      }
      try {
        await prisma.moneyScheduledTransfer.update({
          where: { id: s.id },
          data: {
            lastRunAt: lastRun,
            nextRunAt: next,
          },
        })
      } catch (e) {
        if (!isMissingTableError(e)) throw e
      }
    }
    processed += 1
  }

  return { processed }
}

const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000

export async function processMoneyRateAlerts(): Promise<{ notified: number }> {
  let alerts: any[] = []
  try {
    alerts = await prisma.moneyRateAlert.findMany({
      where: { status: "ACTIVE" },
      take: 200,
    })
  } catch (e) {
    if (isMissingTableError(e)) {
      console.warn("processMoneyRateAlerts: table missing, skipping")
      return { notified: 0 }
    }
    throw e
  }

  let notified = 0
  for (const a of alerts) {
    const rate = await getMoneyTransferFxRate(a.fromCurrency, a.toCurrency)
    if (rate == null) continue

    const hit =
      (a.condition === "above" && rate >= a.targetRate) ||
      (a.condition === "below" && rate <= a.targetRate)
    if (!hit) continue

    if (a.lastNotifiedAt && Date.now() - a.lastNotifiedAt.getTime() < NOTIFY_COOLDOWN_MS) {
      continue
    }

    try {
      await NotificationBridge.sendNotification({
        userId: a.userId,
        title: "Rate alert triggered",
        message: `${a.fromCurrency}/${a.toCurrency} is now ${rate.toFixed(4)} (your target was ${a.targetRate}).`,
        type: "SYSTEM",
        module: "MONEY_TRANSFER",
        data: {
          actionType: "navigate",
          screen: "RateAlertScreen",
        },
      })
      try {
        await prisma.moneyRateAlert.update({
          where: { id: a.id },
          data: { lastNotifiedAt: new Date() },
        })
      } catch (e) {
        if (!isMissingTableError(e)) throw e
      }
      notified += 1
    } catch (e) {
      console.error("processMoneyRateAlerts", a.id, e)
    }
  }

  return { notified }
}

export { processDueMoneyWalletWithdrawals, processSmartAutoPendingWithdrawals } from "@/lib/money-wallet-withdrawal"
