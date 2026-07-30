import { prisma } from "@/lib/prisma"
import { creditWalletForAjoPayout } from "@/lib/ajo-wallet"
import {
  addContributionInterval,
  parseCollectionOrder,
  roundMoney,
} from "@/lib/ajo-utils"
import {
  notifyAjoMember,
  processAjoContributionPayment,
} from "@/lib/ajo-service"
import { tryCalculateCommissionAmount } from "@/lib/commission-service"

function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string }
  return e?.code === "P2021"
}

export async function processAjoDueContributions(): Promise<{ collected: number; failed: number }> {
  const now = new Date()
  let due: { id: string }[] = []
  try {
    due = await prisma.ajoContribution.findMany({
      where: {
        status: { in: ["PENDING", "LATE", "FAILED"] },
        dueDate: { lte: now },
      },
      take: 50,
      select: { id: true },
      orderBy: { dueDate: "asc" },
    })
  } catch (e) {
    if (isMissingTableError(e)) return { collected: 0, failed: 0 }
    throw e
  }

  let collected = 0
  let failed = 0
  for (const row of due) {
    const result = await processAjoContributionPayment(row.id)
    if (result.paid) collected += 1
    else if (!result.alreadyPaid) failed += 1
  }
  return { collected, failed }
}

export async function processAjoRetryFailed(): Promise<{ retried: number }> {
  const rulesCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  let rows: { id: string }[] = []
  try {
    rows = await prisma.ajoContribution.findMany({
      where: {
        status: "FAILED",
        dueDate: { gte: rulesCutoff },
      },
      take: 30,
      select: { id: true },
    })
  } catch (e) {
    if (isMissingTableError(e)) return { retried: 0 }
    throw e
  }

  let retried = 0
  for (const row of rows) {
    await prisma.ajoContribution.update({
      where: { id: row.id },
      data: { status: "PENDING" },
    })
    const result = await processAjoContributionPayment(row.id)
    if (result.paid) retried += 1
  }
  return { retried }
}

async function advanceAjoCycle(groupId: string, cycleId: string) {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: {
      members: { where: { status: "ACTIVE" } },
      cycles: { where: { id: cycleId }, include: { contributions: true } },
    },
  })
  if (!group || group.cycles.length === 0) return

  const cycle = group.cycles[0]
  const order = parseCollectionOrder(group.collectionOrder)
  const nextCycleNumber = group.currentCycle + 1

  if (nextCycleNumber > group.totalCycles) {
    await prisma.ajoGroup.update({
      where: { id: groupId },
      data: { status: "COMPLETED", completedAt: new Date() },
    })
    return
  }

  const nextRecipientId = order[nextCycleNumber - 1]
  const dueDate = addContributionInterval(new Date(), group.frequency)

  await prisma.$transaction(async (tx) => {
    await tx.ajoCycle.update({
      where: { id: cycleId },
      data: { status: "COMPLETED" },
    })

    await tx.ajoGroup.update({
      where: { id: groupId },
      data: {
        currentCycle: nextCycleNumber,
        status: "CYCLE_IN_PROGRESS",
        treasuryBalance: 0,
      },
    })

    const nextCycle = await tx.ajoCycle.create({
      data: {
        groupId,
        cycleNumber: nextCycleNumber,
        recipientId: nextRecipientId,
        dueDate,
        status: "COLLECTING",
        poolTarget: roundMoney(group.contributionAmount * group.members.length),
        poolCollected: 0,
      },
    })

    for (const member of group.members) {
      const fee = await tryCalculateCommissionAmount(
        "MONEY_TRANSFER",
        group.contributionAmount,
        "AJO_PLATFORM_FEE",
      )
      const platformFee = roundMoney(fee)
      const netAmount = roundMoney(group.contributionAmount - platformFee)

      await tx.ajoContribution.create({
        data: {
          cycleId: nextCycle.id,
          groupId,
          userId: member.userId,
          amount: group.contributionAmount,
          platformFee,
          platformFeeRate:
            group.contributionAmount > 0
              ? roundMoney((platformFee / group.contributionAmount) * 100)
              : 0,
          netAmount,
          currency: group.currency,
          status: "PENDING",
          dueDate,
        },
      })
    }
  })
}

export async function processAjoCyclePayouts(): Promise<{ paid: number }> {
  let cycles: Array<{
    id: string
    groupId: string
    recipientId: string
    poolCollected: number
    group: {
      name: string
      currency: string
      contributionAmount: number
      creatorId: string
      members: { userId: string }[]
    }
    contributions: { status: string }[]
  }> = []

  try {
    cycles = await prisma.ajoCycle.findMany({
      where: { status: "COLLECTING" },
      take: 20,
      include: {
        group: {
          select: {
            name: true,
            currency: true,
            contributionAmount: true,
            creatorId: true,
            members: { where: { status: "ACTIVE" }, select: { userId: true } },
          },
        },
        contributions: { select: { status: true } },
      },
    })
  } catch (e) {
    if (isMissingTableError(e)) return { paid: 0 }
    throw e
  }

  let paid = 0
  for (const cycle of cycles) {
    const allPaid = cycle.contributions.every((c) => c.status === "PAID" || c.status === "WAIVED")
    if (!allPaid) continue

    const payoutAmount = roundMoney(cycle.poolCollected)
    if (payoutAmount <= 0) continue

    const existingPayout = await prisma.ajoPayout.findUnique({ where: { cycleId: cycle.id } })
    if (existingPayout?.status === "COMPLETED") continue

    const payout =
      existingPayout ??
      (await prisma.ajoPayout.create({
        data: {
          cycleId: cycle.id,
          groupId: cycle.groupId,
          recipientId: cycle.recipientId,
          amount: payoutAmount,
          currency: cycle.group.currency,
          status: "PROCESSING",
        },
      }))

    try {
      const credit = await creditWalletForAjoPayout({
        senderId: cycle.group.creatorId,
        userId: cycle.recipientId,
        amount: payout.amount,
        currency: cycle.group.currency,
        payoutId: payout.id,
        groupId: cycle.groupId,
        cycleId: cycle.id,
        description: `Ajo payout — ${cycle.group.name}`,
      })

      await prisma.$transaction(async (tx) => {
        await tx.ajoPayout.update({
          where: { id: payout.id },
          data: {
            status: "COMPLETED",
            processedAt: new Date(),
            walletTransactionId: credit.walletTx.id,
          },
        })
        await tx.ajoCycle.update({
          where: { id: cycle.id },
          data: {
            status: "PAYOUT_PENDING",
            payoutStatus: "COMPLETED",
            payoutAt: new Date(),
          },
        })
        await tx.ajoGroup.update({
          where: { id: cycle.groupId },
          data: { status: "CYCLE_PAYOUT_PENDING" },
        })
      })

      await notifyAjoMember({
        userId: cycle.recipientId,
        title: "Ajo payout received",
        body: `${cycle.group.currency} ${payout.amount.toLocaleString()} from ${cycle.group.name} has been added to your wallet`,
        data: { type: "ajo_payout", groupId: cycle.groupId },
      })

      await advanceAjoCycle(cycle.groupId, cycle.id)
      paid += 1
    } catch (e) {
      console.error(`Ajo payout failed for cycle ${cycle.id}:`, e)
      await prisma.ajoPayout.update({
        where: { id: payout.id },
        data: { status: "FAILED" },
      })
    }
  }

  return { paid }
}

let lastUpcomingNotifyDay = ""

export async function processAjoUpcomingNotifications(): Promise<{ notified: number }> {
  const todayKey = new Date().toISOString().slice(0, 10)
  if (lastUpcomingNotifyDay === todayKey) return { notified: 0 }
  lastUpcomingNotifyDay = todayKey

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dayStart = new Date(tomorrow)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(tomorrow)
  dayEnd.setHours(23, 59, 59, 999)

  let contributions: Array<{
    userId: string
    amount: number
    currency: string
    group: { name: string }
  }> = []

  try {
    contributions = await prisma.ajoContribution.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        dueDate: { gte: dayStart, lte: dayEnd },
      },
      take: 100,
      include: { group: { select: { name: true } } },
    })
  } catch (e) {
    if (isMissingTableError(e)) return { notified: 0 }
    throw e
  }

  let notified = 0
  for (const c of contributions) {
    await notifyAjoMember({
      userId: c.userId,
      title: "Ajo payment due tomorrow",
      body: `Your contribution of ${c.currency} ${c.amount.toLocaleString()} for ${c.group.name} is due tomorrow`,
      data: { type: "ajo_due_reminder" },
    })
    notified += 1
  }
  return { notified }
}
