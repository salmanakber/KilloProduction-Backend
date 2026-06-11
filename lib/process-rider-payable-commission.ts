import { prisma } from "@/lib/prisma"
import { markCommissionAsPaid } from "@/lib/commission-service"
import { NotificationBridge } from "@/lib/notification-bridge"
import { createWalletTransaction } from "@/lib/wallet-transaction-service"

const REMINDER_SLOTS_UTC_HOURS = [8, 14, 20]

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function currentReminderSlotIndex(now = new Date()): number {
  const h = now.getUTCHours()
  let idx = -1
  for (let i = 0; i < REMINDER_SLOTS_UTC_HOURS.length; i++) {
    if (h >= REMINDER_SLOTS_UTC_HOURS[i]) idx = i
  }
  return idx
}

async function collectPayableCommission(payableId: string): Promise<boolean> {
  const payable = await prisma.riderPayableCommission.findUnique({
    where: { id: payableId },
    include: {
      rideBooking: { select: { bookingNumber: true } },
    },
  })
  if (!payable || payable.status !== "PENDING") return false

  const amount = round2(payable.commissionAmount)
  if (amount <= 0) {
    await prisma.riderPayableCommission.update({
      where: { id: payableId },
      data: { status: "COLLECTED", collectedAt: new Date() },
    })
    return true
  }

  const wallet = await prisma.wallet.findUnique({
    where: { userId: payable.riderId },
    select: { id: true, balance: true, isActive: true },
  })
  if (!wallet?.isActive || Number(wallet.balance || 0) < amount) {
    return false
  }

  const reference = `payable-commission:ride:${payable.rideBookingId}`

  const existing = await prisma.walletTransaction.findFirst({
    where: { reference, status: "COMPLETED" },
    select: { id: true },
  })
  if (existing) {
    await prisma.riderPayableCommission.update({
      where: { id: payableId },
      data: { status: "COLLECTED", collectedAt: new Date() },
    })
    return true
  }

  await createWalletTransaction({
    userId: payable.riderId,
    type: "DEBIT",
    amount,
    description: `Platform commission for Pay-on-Arrival ride ${payable.rideBooking?.bookingNumber || payable.rideBookingId}`,
    status: "COMPLETED",
    reference,
    metadata: {
      transactionType: "RIDER_PAYABLE_COMMISSION",
      rideBookingId: payable.rideBookingId,
      payableCommissionId: payable.id,
    },
  })

  await prisma.riderPayableCommission.update({
    where: { id: payableId },
    data: { status: "COLLECTED", collectedAt: new Date() },
  })

  if (payable.riderCommissionId) {
    await markCommissionAsPaid(payable.riderCommissionId, "RIDER")
  } else {
    await prisma.riderCommission.updateMany({
      where: { rideBookingId: payable.rideBookingId, riderId: payable.riderId, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date() },
    })
  }

  await NotificationBridge.sendNotification({
    userId: payable.riderId,
    title: "Commission settled",
    message: `${amount.toFixed(2)} platform commission was deducted from your wallet for a Pay-on-Arrival ride.`,
    type: "WALLET_UPDATE",
    module: "RIDING",
    data: { actionType: "navigate", screen: "Wallet" },
  })

  return true
}

async function lockRiderForUnpaidCommission(params: {
  riderId: string
  payableId: string
  amount: number
}): Promise<void> {
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.riderPayableCommission.update({
      where: { id: params.payableId },
      data: { status: "LOCKED", lockedAt: now },
    })
    await tx.riderProfile.updateMany({
      where: { userId: params.riderId },
      data: {
        isCommissionLocked: true,
        commissionLockedAt: now,
        commissionLockReason: "UNPAID_PAY_ON_ARRIVAL_COMMISSION",
        isAvailable: false,
      },
    })
  })

  await NotificationBridge.sendNotification({
    userId: params.riderId,
    title: "Account temporarily locked",
    message: `Your rider account has been locked due to unpaid platform commission (${params.amount.toFixed(2)}). Please add wallet balance and contact support to reactivate.`,
    type: "ACCOUNT_ALERT",
    module: "RIDING",
    data: { actionType: "navigate", screen: "RiderCommissionLocked" },
  })
}

async function maybeSendReminder(payable: {
  id: string
  riderId: string
  commissionAmount: number
  dueAt: Date
  remindersSentToday: number
  lastReminderDay: string | null
  lastReminderAt: Date | null
}): Promise<boolean> {
  const now = new Date()
  const dayKey = utcDayKey(now)
  const slotIdx = currentReminderSlotIndex(now)
  if (slotIdx < 0) return false

  let sentToday = payable.remindersSentToday
  if (payable.lastReminderDay !== dayKey) {
    sentToday = 0
  }
  if (sentToday >= REMINDER_SLOTS_UTC_HOURS.length) return false
  if (sentToday > slotIdx) return false

  const msLeft = payable.dueAt.getTime() - now.getTime()
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)))

  await NotificationBridge.sendNotification({
    userId: payable.riderId,
    title: "Platform commission due",
    message: `Add ${payable.commissionAmount.toFixed(2)} to your wallet within ${daysLeft} day${daysLeft === 1 ? "" : "s"} to settle Pay-on-Arrival platform commission.`,
    type: "ACCOUNT_ALERT",
    module: "RIDING",
    data: { actionType: "navigate", screen: "Wallet" },
  })

  await prisma.riderPayableCommission.update({
    where: { id: payable.id },
    data: {
      remindersSentToday: sentToday + 1,
      lastReminderDay: dayKey,
      lastReminderAt: now,
      totalRemindersSent: { increment: 1 },
    },
  })

  return true
}

/**
 * Recover Pay-on-Arrival platform commissions from rider wallets.
 * Sends up to 3 reminders per day during the grace period; locks account after dueAt.
 */
export async function processRiderPayableCommissionRecovery(): Promise<{
  collected: number
  reminded: number
  locked: number
}> {
  const now = new Date()
  const pending = await prisma.riderPayableCommission.findMany({
    where: { status: "PENDING" },
    take: 200,
    orderBy: { dueAt: "asc" },
  })

  let collected = 0
  let reminded = 0
  let locked = 0

  for (const row of pending) {
    try {
      const didCollect = await collectPayableCommission(row.id)
      if (didCollect) {
        collected++
        continue
      }

      if (now.getTime() > row.dueAt.getTime()) {
        if (!row.finalNoticeSentAt) {
          await prisma.riderPayableCommission.update({
            where: { id: row.id },
            data: { finalNoticeSentAt: now },
          })
        }
        await lockRiderForUnpaidCommission({
          riderId: row.riderId,
          payableId: row.id,
          amount: row.commissionAmount,
        })
        locked++
        continue
      }

      const sent = await maybeSendReminder(row)
      if (sent) reminded++
    } catch (e) {
      console.error("[processRiderPayableCommissionRecovery]", row.id, e)
    }
  }

  return { collected, reminded, locked }
}

/** Summary for rider dashboard banner. */
export async function getRiderPayableCommissionSummary(riderId: string) {
  const rows = await prisma.riderPayableCommission.findMany({
    where: { riderId, status: "PENDING" },
    orderBy: { dueAt: "asc" },
    select: {
      id: true,
      commissionAmount: true,
      dueAt: true,
      rideBooking: { select: { bookingNumber: true } },
    },
  })

  const totalPending = round2(rows.reduce((s, r) => s + (r.commissionAmount || 0), 0))
  const earliestDue = rows[0]?.dueAt ?? null
  const daysRemaining = earliestDue
    ? Math.max(0, Math.ceil((earliestDue.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null

  return {
    pendingCount: rows.length,
    totalPendingAmount: totalPending,
    earliestDueAt: earliestDue?.toISOString() ?? null,
    daysRemaining,
    items: rows.map((r) => ({
      id: r.id,
      amount: r.commissionAmount,
      dueAt: r.dueAt.toISOString(),
      bookingNumber: r.rideBooking?.bookingNumber,
    })),
  }
}

/** Admin reactivation after dues resolved manually or via wallet top-up + collection. */
export async function reactivateRiderCommissionLock(riderId: string, adminId?: string): Promise<void> {
  const profile = await prisma.riderProfile.findUnique({
    where: { userId: riderId },
    select: { isCommissionLocked: true },
  })
  if (!profile?.isCommissionLocked) return

  const newDueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

  await prisma.$transaction(async (tx) => {
    await tx.riderProfile.update({
      where: { userId: riderId },
      data: {
        isCommissionLocked: false,
        commissionLockedAt: null,
        commissionLockReason: null,
      },
    })

    await tx.riderPayableCommission.updateMany({
      where: { riderId, status: "LOCKED" },
      data: { status: "PENDING", dueAt: newDueAt, lockedAt: null },
    })
  })

  await NotificationBridge.sendNotification({
    userId: riderId,
    title: "Account reactivated",
    message:
      "Your rider account has been reactivated by support. Please ensure your wallet has enough balance to settle any outstanding Pay-on-Arrival platform commission.",
    type: "ACCOUNT_ALERT",
    module: "RIDING",
    data: { actionType: "navigate", screen: "RiderDashboard" },
  })

  void adminId
}
