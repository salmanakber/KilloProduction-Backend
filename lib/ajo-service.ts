import {
  AjoContributionFrequency,
  AjoContributionStatus,
  AjoGroupType,
  Prisma,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { tryCalculateCommissionAmount } from "@/lib/commission-service"
import { debitWalletForAjoContribution } from "@/lib/ajo-wallet"
import { getSystemDefaultCurrency } from "@/lib/money-transfer-wallet"
import { NotificationBridge } from "@/lib/notification-bridge"
import {
  addContributionInterval,
  computeAjoPayoutDate,
  generateAjoInviteCode,
  getContributionGraceInfo,
  parseAjoGroupRules,
  parseCollectionOrder,
  roundMoney,
  type AjoGroupRules,
} from "@/lib/ajo-utils"
import { assertTransferPinToken } from "@/lib/money-transfer-profile"

const groupInclude = {
  creator: { select: { id: true, name: true, avatar: true } },
  members: {
    include: {
      user: { select: { id: true, name: true, avatar: true, phone: true } },
    },
    orderBy: { slotPosition: "asc" as const },
  },
  cycles: {
    orderBy: { cycleNumber: "asc" as const },
    include: {
      contributions: true,
      recipient: { select: { id: true, name: true, avatar: true } },
    },
  },
} satisfies Prisma.AjoGroupInclude

export async function listUserAjoGroups(userId: string) {
  const memberships = await prisma.ajoGroupMember.findMany({
    where: { userId, status: { in: ["INVITED", "ACTIVE"] } },
    select: { groupId: true },
  })
  const groupIds = memberships.map((m) => m.groupId)

  return prisma.ajoGroup.findMany({
    where: {
      OR: [{ creatorId: userId }, { id: { in: groupIds } }],
      status: { not: "CANCELLED" },
    },
    include: groupInclude,
    orderBy: { updatedAt: "desc" },
  })
}

export async function getAjoGroupForUser(groupId: string, userId: string) {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: groupInclude,
  })
  if (!group) return null

  const isMember = group.members.some(
    (m) => m.userId === userId && m.status !== "REMOVED" && m.status !== "LEFT",
  )
  if (!isMember && group.creatorId !== userId) return null
  return group
}

export async function createAjoGroup(args: {
  userId: string
  name: string
  description?: string
  contributionAmount: number
  currency?: string
  frequency: AjoContributionFrequency
  maxMembers: number
  type?: AjoGroupType
}) {
  if (!args.name.trim()) throw new Error("Group name is required")
  if (!Number.isFinite(args.contributionAmount) || args.contributionAmount <= 0) {
    throw new Error("Invalid contribution amount")
  }
  if (!Number.isInteger(args.maxMembers) || args.maxMembers < 2 || args.maxMembers > 50) {
    throw new Error("Group must have between 2 and 50 members")
  }

  let inviteCode = generateAjoInviteCode()
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.ajoGroup.findUnique({ where: { inviteCode } })
    if (!exists) break
    inviteCode = generateAjoInviteCode()
  }

  const systemCurrency = await getSystemDefaultCurrency()
  const currency = (args.currency || systemCurrency).toUpperCase().slice(0, 3)

  return prisma.$transaction(async (tx) => {
    const group = await tx.ajoGroup.create({
      data: {
        name: args.name.trim(),
        description: args.description?.trim() || null,
        type: args.type ?? "ROTATIONAL",
        status: "DRAFT",
        creatorId: args.userId,
        contributionAmount: roundMoney(args.contributionAmount),
        currency,
        frequency: args.frequency,
        maxMembers: args.maxMembers,
        totalCycles: args.maxMembers,
        collectionOrder: [],
        inviteCode,
        rules: {
          gracePeriodHours: 24,
          collectionOrderStrategy: "FIRST_JOIN",
          lateFeePercent: 0,
          requirePinForContribute: true,
        },
      },
    })

    await tx.ajoGroupMember.create({
      data: {
        groupId: group.id,
        userId: args.userId,
        role: "CREATOR",
        status: "ACTIVE",
        slotPosition: 0,
        joinedAt: new Date(),
      },
    })

    return group
  })
}

export async function joinAjoGroupByInvite(userId: string, inviteCode: string) {
  const code = inviteCode.trim().toUpperCase()
  const group = await prisma.ajoGroup.findUnique({
    where: { inviteCode: code },
    include: { members: true },
  })
  if (!group) throw new Error("Invalid invite code")
  if (group.status !== "DRAFT" && group.status !== "ACTIVE") {
    throw new Error("This group is no longer accepting members")
  }

  const existing = group.members.find((m) => m.userId === userId)
  if (existing) {
    if (existing.status === "ACTIVE") {
      return { group, alreadyMember: true }
    }
    if (existing.status === "INVITED") {
      await prisma.ajoGroupMember.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", joinedAt: new Date() },
      })
      return { group, alreadyMember: false }
    }
    throw new Error("You cannot rejoin this group")
  }

  const activeCount = group.members.filter((m) => m.status === "ACTIVE" || m.status === "INVITED").length
  if (activeCount >= group.maxMembers) throw new Error("Group is full")

  const member = await prisma.ajoGroupMember.create({
    data: {
      groupId: group.id,
      userId,
      role: "MEMBER",
      status: "ACTIVE",
      slotPosition: activeCount,
      joinedAt: new Date(),
    },
  })

  return { group, member, alreadyMember: false }
}

export async function startAjoGroup(
  groupId: string,
  userId: string,
  opts?: { force?: boolean },
) {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: { members: { where: { status: "ACTIVE" } } },
  })
  if (!group) throw new Error("Group not found")
  if (group.creatorId !== userId) throw new Error("Only the creator can start the group")
  if (group.status !== "DRAFT") throw new Error("Group has already started")

  const activeMembers = group.members
  if (activeMembers.length < 2) throw new Error("At least 2 active members required to start")

  const balanceCheck = await checkAjoMembersBalances(groupId)
  if (!opts?.force && balanceCheck.insufficient.length > 0) {
    const err = new Error(
      `${balanceCheck.insufficient.length} member(s) have insufficient wallet balance for the first contribution`,
    ) as Error & { code?: string; balanceCheck?: typeof balanceCheck }
    err.code = "INSUFFICIENT_MEMBER_BALANCES"
    err.balanceCheck = balanceCheck
    throw err
  }

  const rules = parseAjoGroupRules(group.rules)
  let order = activeMembers
    .sort((a, b) => (a.slotPosition ?? 0) - (b.slotPosition ?? 0))
    .map((m) => m.userId)

  if (rules.collectionOrderStrategy === "RANDOM") {
    order = [...order].sort(() => Math.random() - 0.5)
  }

  const now = new Date()
  const firstRecipientId = order[0]
  const dueDate = addContributionInterval(now, group.frequency)

  return prisma.$transaction(async (tx) => {
    await tx.ajoGroup.update({
      where: { id: groupId },
      data: {
        status: "CYCLE_IN_PROGRESS",
        currentCycle: 1,
        totalCycles: activeMembers.length,
        maxMembers: activeMembers.length,
        collectionOrder: order,
        startedAt: now,
      },
    })

    for (let i = 0; i < order.length; i++) {
      await tx.ajoGroupMember.updateMany({
        where: { groupId, userId: order[i] },
        data: { slotPosition: i },
      })
    }

    const cycle = await tx.ajoCycle.create({
      data: {
        groupId,
        cycleNumber: 1,
        recipientId: firstRecipientId,
        dueDate,
        status: "COLLECTING",
        poolTarget: roundMoney(group.contributionAmount * activeMembers.length),
        poolCollected: 0,
      },
    })

    for (const member of activeMembers) {
      const fee = await tryCalculateCommissionAmount(
        "MONEY_TRANSFER",
        group.contributionAmount,
        "AJO_PLATFORM_FEE",
      )
      const platformFee = roundMoney(fee)
      const netAmount = roundMoney(group.contributionAmount - platformFee)

      await tx.ajoContribution.create({
        data: {
          cycleId: cycle.id,
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

    return tx.ajoGroup.findUnique({
      where: { id: groupId },
      include: groupInclude,
    })
  })
}

export async function processAjoContributionPayment(contributionId: string) {
  const contribution = await prisma.ajoContribution.findUnique({
    where: { id: contributionId },
    include: {
      group: true,
      cycle: true,
      user: { select: { id: true, name: true } },
    },
  })
  if (!contribution) throw new Error("Contribution not found")
  if (contribution.status === "PAID" || contribution.status === "WAIVED") {
    return { paid: false, alreadyPaid: true }
  }

  try {
    const result = await debitWalletForAjoContribution({
      userId: contribution.userId,
      recipientId: contribution.cycle.recipientId,
      amount: contribution.amount,
      currency: contribution.currency,
      contributionId: contribution.id,
      groupId: contribution.groupId,
      cycleId: contribution.cycleId,
      description: `Ajo contribution — ${contribution.group.name}`,
    })

    const transferId = result.walletTx.transferId ?? null

    await prisma.$transaction(async (tx) => {
      await tx.ajoContribution.update({
        where: { id: contribution.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          walletTransactionId: result.walletTx.id,
          failureReason: null,
        },
      })

      await tx.ajoCycle.update({
        where: { id: contribution.cycleId },
        data: {
          poolCollected: {
            increment: contribution.netAmount,
          },
        },
      })

      await tx.ajoGroup.update({
        where: { id: contribution.groupId },
        data: {
          treasuryBalance: { increment: contribution.netAmount },
        },
      })

      // On-time or paid after due: nudge reputation up (capped)
      const member = await tx.ajoGroupMember.findFirst({
        where: { groupId: contribution.groupId, userId: contribution.userId },
      })
      if (member) {
        const paidLate = contribution.dueDate.getTime() < Date.now() - 60_000
        const delta = paidLate ? 1 : 3
        await tx.ajoGroupMember.update({
          where: { id: member.id },
          data: { reputationScore: Math.min(100, (member.reputationScore ?? 100) + delta) },
        })
      }
    })

    return {
      paid: true,
      alreadyPaid: false,
      contributionId: contribution.id,
      transferId,
      walletTransactionId: result.walletTx.id,
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Payment failed"
    const status: AjoContributionStatus =
      message.includes("Insufficient") ? "FAILED" : "FAILED"

    await prisma.$transaction(async (tx) => {
      await tx.ajoContribution.update({
        where: { id: contribution.id },
        data: {
          status,
          failureReason: message,
        },
      })
      const member = await tx.ajoGroupMember.findFirst({
        where: { groupId: contribution.groupId, userId: contribution.userId },
      })
      if (member) {
        await tx.ajoGroupMember.update({
          where: { id: member.id },
          data: { reputationScore: Math.max(0, (member.reputationScore ?? 100) - 5) },
        })
      }
    })

    const isInsufficient = message.toLowerCase().includes("insufficient")
    await notifyAjoMember({
      userId: contribution.userId,
      title: isInsufficient ? "Ajo collection failed — top up" : "Ajo collection failed",
      body: isInsufficient
        ? `We couldn't collect ${contribution.currency} ${contribution.amount.toLocaleString()} for "${contribution.group.name}". Top up your wallet and pay to stay on track.`
        : `Your contribution for "${contribution.group.name}" could not be collected. Open the group to retry.`,
      data: {
        type: isInsufficient ? "ajo_topup_needed" : "ajo_collection_failed",
        groupId: contribution.groupId,
        actionType: "navigate",
        screen: isInsufficient ? "MoneyTopUp" : "AjoGroupDetail",
      },
    })

    // Notify creator once when a member fails
    if (contribution.group.creatorId !== contribution.userId) {
      await notifyAjoMember({
        userId: contribution.group.creatorId,
        title: "Member contribution failed",
        body: `${contribution.user.name || "A member"} missed collection for "${contribution.group.name}". You can remind, retry, or skip after grace.`,
        data: {
          type: "ajo_member_failed",
          groupId: contribution.groupId,
          actionType: "navigate",
          screen: "AjoGroupDetail",
        },
      })
    }

    return {
      paid: false,
      alreadyPaid: false,
      error: message,
      code: isInsufficient ? "INSUFFICIENT_BALANCE" : "COLLECTION_FAILED",
    }
  }
}

export async function manualContributeToAjo(
  groupId: string,
  userId: string,
  opts?: { cycleId?: string; transferPinToken?: string },
) {
  const group = await getAjoGroupForUser(groupId, userId)
  if (!group) throw new Error("Group not found")

  const rules = parseAjoGroupRules(group.rules)
  if (rules.requirePinForContribute !== false) {
    await assertTransferPinToken(opts?.transferPinToken, userId)
  }

  const targetCycleId =
    opts?.cycleId ??
    group.cycles.find((c) => c.status === "COLLECTING")?.id ??
    group.cycles[group.cycles.length - 1]?.id

  if (!targetCycleId) throw new Error("No active cycle")

  const contribution = await prisma.ajoContribution.findUnique({
    where: { cycleId_userId: { cycleId: targetCycleId, userId } },
  })
  if (!contribution) throw new Error("Contribution not found")
  if (contribution.status === "PAID") {
    // Resolve linked transfer for receipt navigation when already paid
    let transferId: string | null = null
    if (contribution.walletTransactionId) {
      const wtx = await prisma.moneyTransferWalletTransaction.findUnique({
        where: { id: contribution.walletTransactionId },
        select: { transferId: true },
      })
      transferId = wtx?.transferId ?? null
    }
    return { success: true, alreadyPaid: true, contributionId: contribution.id, transferId }
  }

  const result = await processAjoContributionPayment(contribution.id)
  if (!result.paid && result.error) {
    const err = new Error(result.error) as Error & { code?: string }
    if (result.error.includes("Insufficient")) err.code = "INSUFFICIENT_BALANCE"
    throw err
  }
  return {
    success: true,
    contributionId: contribution.id,
    transferId: result.transferId ?? null,
    walletTransactionId: result.walletTransactionId ?? null,
  }
}

export async function getAjoJoinPreview(inviteCode: string) {
  const group = await prisma.ajoGroup.findUnique({
    where: { inviteCode: inviteCode.trim().toUpperCase() },
    include: {
      creator: { select: { id: true, name: true, avatar: true } },
      members: { where: { status: { in: ["ACTIVE", "INVITED"] } } },
    },
  })
  if (!group) return null
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    contributionAmount: group.contributionAmount,
    currency: group.currency,
    frequency: group.frequency,
    maxMembers: group.maxMembers,
    memberCount: group.members.length,
    status: group.status,
    creator: group.creator,
    inviteCode: group.inviteCode,
    inviteLink: `https://app.kilo1app.com/money-app/ajo/join/${group.inviteCode}`,
  }
}

export async function checkAjoMembersBalances(groupId: string) {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: { select: { id: true, name: true, phone: true, avatar: true } } },
      },
    },
  })
  if (!group) throw new Error("Group not found")

  const currency = group.currency
  const needed = group.contributionAmount
  const wallets = await prisma.moneyTransferWallet.findMany({
    where: {
      userId: { in: group.members.map((m) => m.userId) },
      currency,
      isActive: true,
    },
  })
  const byUser = new Map(wallets.map((w) => [w.userId, w.balance]))

  const members = group.members.map((m) => {
    const balance = byUser.get(m.userId) ?? 0
    return {
      userId: m.userId,
      name: m.user.name || m.user.phone || "Member",
      avatar: m.user.avatar,
      balance,
      currency,
      needed,
      sufficient: balance >= needed,
    }
  })

  return {
    contributionAmount: needed,
    currency,
    members,
    sufficient: members.filter((m) => m.sufficient),
    insufficient: members.filter((m) => !m.sufficient),
    ready: members.every((m) => m.sufficient),
  }
}

export async function updateAjoGroupRules(
  groupId: string,
  userId: string,
  patch: Partial<AjoGroupRules>,
) {
  const group = await prisma.ajoGroup.findUnique({ where: { id: groupId } })
  if (!group) throw new Error("Group not found")
  if (group.creatorId !== userId) throw new Error("Only the creator can update rules")
  if (group.status !== "DRAFT" && group.status !== "ACTIVE" && group.status !== "CYCLE_IN_PROGRESS") {
    throw new Error("Rules cannot be changed for this group status")
  }
  // After first cycle starts, only grace/late fee tweaks for DRAFT/ACTIVE; allow DRAFT freely
  if (group.status === "CYCLE_IN_PROGRESS" && group.currentCycle > 0) {
    // still allow grace updates mid-cycle
  }

  const current = parseAjoGroupRules(group.rules)
  const next = parseAjoGroupRules({ ...current, ...patch })

  return prisma.ajoGroup.update({
    where: { id: groupId },
    data: { rules: next as Prisma.InputJsonValue },
    include: groupInclude,
  })
}

export async function inviteAjoMember(args: {
  groupId: string
  inviterId: string
  userId?: string
  phone?: string
  query?: string
}) {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: args.groupId },
    include: { members: true },
  })
  if (!group) throw new Error("Group not found")

  const isAllowed =
    group.creatorId === args.inviterId ||
    group.members.some(
      (m) =>
        m.userId === args.inviterId &&
        (m.role === "CREATOR" || m.role === "ADMIN" || m.status === "ACTIVE"),
    )
  if (!isAllowed) throw new Error("Only group members can invite")
  if (group.status !== "DRAFT" && group.status !== "ACTIVE") {
    throw new Error("This group is no longer accepting invites")
  }

  let targetUserId = args.userId
  if (!targetUserId) {
    const q = (args.query || args.phone || "").trim()
    if (!q) throw new Error("Provide a user or phone number")
    const digits = q.replace(/\D/g, "")
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: q },
          ...(digits.length >= 7 ? [{ phone: { contains: digits.slice(-10) } }] : []),
          { email: { equals: q, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    })
    if (!user) throw new Error("No registered Kilo user found for that contact")
    targetUserId = user.id
  }

  if (targetUserId === args.inviterId) throw new Error("You are already in this group")

  const existing = group.members.find((m) => m.userId === targetUserId)
  if (existing && (existing.status === "ACTIVE" || existing.status === "INVITED")) {
    return { alreadyMember: true, userId: targetUserId }
  }

  const activeCount = group.members.filter((m) => m.status === "ACTIVE" || m.status === "INVITED").length
  if (activeCount >= group.maxMembers) throw new Error("Group is full")

  if (existing) {
    await prisma.ajoGroupMember.update({
      where: { id: existing.id },
      data: { status: "INVITED", invitedAt: new Date() },
    })
  } else {
    await prisma.ajoGroupMember.create({
      data: {
        groupId: args.groupId,
        userId: targetUserId,
        role: "MEMBER",
        status: "INVITED",
        slotPosition: activeCount,
        invitedAt: new Date(),
      },
    })
  }

  await notifyAjoMember({
    userId: targetUserId,
    title: "Ajo invite",
    body: `You've been invited to "${group.name}" — ${group.currency} ${group.contributionAmount.toLocaleString()}/${group.frequency.toLowerCase()}`,
    data: {
      type: "ajo_invite",
      groupId: group.id,
      inviteCode: group.inviteCode,
      actionType: "navigate",
      screen: "AjoJoinGroup",
    },
  })

  return { alreadyMember: false, userId: targetUserId, inviteCode: group.inviteCode }
}

export function serializeAjoGroup(
  group: NonNullable<Awaited<ReturnType<typeof getAjoGroupForUser>>>,
  userId?: string,
) {
  const order = parseCollectionOrder(group.collectionOrder)
  const activeCycle = group.cycles.find((c) => c.cycleNumber === group.currentCycle)
  const rules = parseAjoGroupRules(group.rules)
  const myMembership = userId
    ? group.members.find((m) => m.userId === userId)
    : group.members.find((m) => m.userId === group.creatorId)

  const myContribution = userId
    ? activeCycle?.contributions.find((c) => c.userId === userId) ?? null
    : null

  const grace = myContribution
    ? getContributionGraceInfo({
        dueDate: new Date(myContribution.dueDate),
        status: myContribution.status,
        gracePeriodHours: rules.gracePeriodHours ?? 24,
      })
    : null

  const mySlot =
    myMembership?.slotPosition ?? (userId ? order.indexOf(userId) : -1)

  const myPayoutDate = computeAjoPayoutDate({
    startedAt: group.startedAt,
    frequency: group.frequency,
    slotPosition: mySlot >= 0 ? mySlot : -1,
    totalCycles: group.totalCycles,
  })

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    type: group.type,
    status: group.status,
    contributionAmount: group.contributionAmount,
    currency: group.currency,
    frequency: group.frequency,
    maxMembers: group.maxMembers,
    currentCycleNumber: group.currentCycle,
    totalCycles: group.totalCycles,
    treasuryBalance: group.treasuryBalance,
    inviteCode: group.inviteCode,
    inviteLink: `https://app.kilo1app.com/money-app/ajo/join/${group.inviteCode}`,
    startedAt: group.startedAt?.toISOString() ?? null,
    completedAt: group.completedAt?.toISOString() ?? null,
    creator: group.creator,
    collectionOrder: order,
    rules,
    myPayoutDate,
    myContribution: myContribution
      ? {
          ...myContribution,
          graceEndsAt: grace?.graceEndsAt ?? null,
          graceRemainingMs: grace?.graceRemainingMs ?? null,
          isInGrace: grace?.isInGrace ?? false,
        }
      : null,
    members: group.members
      .filter((m) => m.status === "ACTIVE" || m.status === "INVITED")
      .map((m) => {
      const slot = m.slotPosition ?? order.indexOf(m.userId)
      return {
        id: m.id,
        userId: m.userId,
        role: m.role,
        status: m.status,
        slotPosition: m.slotPosition,
        reputationScore: m.reputationScore,
        joinedAt: m.joinedAt?.toISOString() ?? null,
        user: m.user,
        payoutDate: computeAjoPayoutDate({
          startedAt: group.startedAt,
          frequency: group.frequency,
          slotPosition: slot >= 0 ? slot : -1,
          totalCycles: group.totalCycles,
        }),
        currentContribution: activeCycle?.contributions.find((c) => c.userId === m.userId) ?? null,
      }
    }),
    activeCycle: activeCycle
      ? {
          id: activeCycle.id,
          cycleNumber: activeCycle.cycleNumber,
          recipientId: activeCycle.recipientId,
          recipient: activeCycle.recipient,
          dueDate: activeCycle.dueDate.toISOString(),
          status: activeCycle.status,
          poolTarget: activeCycle.poolTarget,
          poolCollected: activeCycle.poolCollected,
          contributions: activeCycle.contributions,
        }
      : null,
    cycles: group.cycles.map((c) => ({
      id: c.id,
      cycleNumber: c.cycleNumber,
      recipientId: c.recipientId,
      recipient: c.recipient,
      dueDate: c.dueDate.toISOString(),
      status: c.status,
      poolTarget: c.poolTarget,
      poolCollected: c.poolCollected,
      payoutStatus: c.payoutStatus,
      payoutAt: c.payoutAt?.toISOString() ?? null,
    })),
    myMembership,
  }
}

export async function notifyAjoMember(args: {
  userId: string
  title: string
  body: string
  data?: Record<string, string>
}) {
  try {
    await NotificationBridge.sendNotification({
      userId: args.userId,
      title: args.title,
      message: args.body,
      type: "SYSTEM",
      module: "MONEY_TRANSFER",
      data: args.data,
    })
  } catch (e) {
    console.error("Ajo notification failed:", e)
  }
}

/** Member leaves a DRAFT group (creator cannot leave — must cancel/remove others first). */
export async function leaveAjoGroup(groupId: string, userId: string) {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: { members: true },
  })
  if (!group) throw new Error("Group not found")
  if (group.status !== "DRAFT") {
    throw new Error("You can only leave while the group is still in draft")
  }

  const membership = group.members.find((m) => m.userId === userId)
  if (!membership || membership.status === "LEFT" || membership.status === "REMOVED") {
    throw new Error("You are not an active member of this group")
  }
  if (membership.role === "CREATOR" || group.creatorId === userId) {
    throw new Error("Creators cannot leave — remove members or cancel the group instead")
  }

  await prisma.ajoGroupMember.update({
    where: { id: membership.id },
    data: { status: "LEFT" },
  })

  return { success: true }
}

/** Creator removes a member from a DRAFT group. */
export async function removeAjoMember(groupId: string, actorId: string, targetUserId: string) {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: { members: true },
  })
  if (!group) throw new Error("Group not found")
  if (group.creatorId !== actorId) throw new Error("Only the creator can remove members")
  if (group.status !== "DRAFT") {
    throw new Error("Members can only be removed while the group is in draft")
  }
  if (targetUserId === actorId) throw new Error("You cannot remove yourself as creator")

  const membership = group.members.find((m) => m.userId === targetUserId)
  if (!membership || membership.status === "REMOVED" || membership.status === "LEFT") {
    throw new Error("Member not found")
  }

  await prisma.ajoGroupMember.update({
    where: { id: membership.id },
    data: { status: "REMOVED" },
  })

  // Compact slot positions for remaining active/invited members
  const remaining = group.members
    .filter(
      (m) =>
        m.userId !== targetUserId &&
        (m.status === "ACTIVE" || m.status === "INVITED"),
    )
    .sort((a, b) => (a.slotPosition ?? 0) - (b.slotPosition ?? 0))

  await prisma.$transaction(
    remaining.map((m, idx) =>
      prisma.ajoGroupMember.update({
        where: { id: m.id },
        data: { slotPosition: idx },
      }),
    ),
  )

  return { success: true }
}

/** Creator retries failed contributions for the active collecting cycle. */
export async function retryFailedAjoContributions(groupId: string, actorId: string) {
  const group = await getAjoGroupForUser(groupId, actorId)
  if (!group) throw new Error("Group not found")
  if (group.creatorId !== actorId) throw new Error("Only the creator can retry collections")

  const activeCycle =
    group.cycles.find((c) => c.status === "COLLECTING") ??
    group.cycles.find((c) => c.cycleNumber === group.currentCycle)
  if (!activeCycle) throw new Error("No active cycle")

  const failed = activeCycle.contributions.filter(
    (c) => c.status === "FAILED" || c.status === "LATE" || c.status === "PENDING",
  )
  const overdueOrFailed = failed.filter(
    (c) => c.status === "FAILED" || c.status === "LATE" || new Date(c.dueDate) <= new Date(),
  )

  let collected = 0
  let stillFailed = 0
  const results: Array<{ userId: string; paid: boolean; error?: string }> = []

  for (const row of overdueOrFailed.filter((c) => c.status === "FAILED" || c.status === "LATE")) {
    if (row.status === "FAILED") {
      await prisma.ajoContribution.update({
        where: { id: row.id },
        data: { status: "PENDING", failureReason: null },
      })
    }
    const result = await processAjoContributionPayment(row.id)
    if (result.paid) {
      collected += 1
      results.push({ userId: row.userId, paid: true })
    } else if (!result.alreadyPaid) {
      stillFailed += 1
      results.push({ userId: row.userId, paid: false, error: result.error })
    }
  }

  return {
    success: true,
    attempted: overdueOrFailed.filter((c) => c.status === "FAILED" || c.status === "LATE").length,
    collected,
    stillFailed,
    results,
  }
}

/** Creator (or self) sends a payment reminder push to unpaid members. */
export async function remindAjoMembers(
  groupId: string,
  actorId: string,
  opts?: { userId?: string },
) {
  const group = await getAjoGroupForUser(groupId, actorId)
  if (!group) throw new Error("Group not found")

  const isCreator = group.creatorId === actorId
  if (!isCreator && opts?.userId && opts.userId !== actorId) {
    throw new Error("Only the creator can remind other members")
  }

  const activeCycle =
    group.cycles.find((c) => c.status === "COLLECTING") ??
    group.cycles.find((c) => c.cycleNumber === group.currentCycle)
  if (!activeCycle) throw new Error("No active cycle")

  const unpaid = activeCycle.contributions.filter(
    (c) => c.status !== "PAID" && c.status !== "WAIVED",
  )
  const targets = opts?.userId
    ? unpaid.filter((c) => c.userId === opts.userId)
    : isCreator
      ? unpaid
      : unpaid.filter((c) => c.userId === actorId)

  let notified = 0
  for (const c of targets) {
    await notifyAjoMember({
      userId: c.userId,
      title: "Ajo payment reminder",
      body: `Please contribute ${group.currency} ${group.contributionAmount.toLocaleString()} to "${group.name}"`,
      data: {
        type: "ajo_due_reminder",
        groupId: group.id,
        actionType: "navigate",
        screen: "AjoGroupDetail",
      },
    })
    notified += 1
  }

  return { success: true, notified }
}

/**
 * Creator waives an unpaid contribution after the group's grace period.
 * Pool target is reduced so the cycle can still pay out to the recipient.
 */
export async function waiveAjoContribution(args: {
  groupId: string
  actorId: string
  contributionId: string
  reason?: string
}) {
  const group = await getAjoGroupForUser(args.groupId, args.actorId)
  if (!group) throw new Error("Group not found")
  if (group.creatorId !== args.actorId) {
    throw new Error("Only the creator can skip / waive a contribution")
  }

  const rules = parseAjoGroupRules(group.rules)
  const graceHours = rules.gracePeriodHours ?? 24

  const contribution = await prisma.ajoContribution.findFirst({
    where: { id: args.contributionId, groupId: args.groupId },
    include: { user: { select: { id: true, name: true } } },
  })
  if (!contribution) throw new Error("Contribution not found")
  if (contribution.status === "PAID" || contribution.status === "WAIVED") {
    return { success: true, alreadySettled: true }
  }

  const graceEnds = new Date(
    contribution.dueDate.getTime() + graceHours * 60 * 60 * 1000,
  )
  if (Date.now() < graceEnds.getTime()) {
    const err = new Error(
      `Grace period is still active until ${graceEnds.toISOString()}. You can remind or retry until then.`,
    ) as Error & { code?: string; graceEndsAt?: string }
    err.code = "GRACE_ACTIVE"
    err.graceEndsAt = graceEnds.toISOString()
    throw err
  }

  await prisma.$transaction(async (tx) => {
    await tx.ajoContribution.update({
      where: { id: contribution.id },
      data: {
        status: "WAIVED",
        failureReason: args.reason?.trim() || "Skipped by group admin after grace",
      },
    })

    const cycle = await tx.ajoCycle.findUnique({ where: { id: contribution.cycleId } })
    if (cycle) {
      const nextTarget = Math.max(0, roundMoney(cycle.poolTarget - contribution.netAmount))
      await tx.ajoCycle.update({
        where: { id: contribution.cycleId },
        data: { poolTarget: nextTarget },
      })
    }

    const member = await tx.ajoGroupMember.findFirst({
      where: { groupId: args.groupId, userId: contribution.userId },
    })
    if (member) {
      await tx.ajoGroupMember.update({
        where: { id: member.id },
        data: { reputationScore: Math.max(0, (member.reputationScore ?? 100) - 15) },
      })
    }
  })

  await notifyAjoMember({
    userId: contribution.userId,
    title: "Ajo contribution skipped",
    body: `Your unpaid contribution for "${group.name}" was skipped after the grace period. Your trust score was reduced.`,
    data: {
      type: "ajo_waived",
      groupId: group.id,
      actionType: "navigate",
      screen: "AjoGroupDetail",
    },
  })

  return { success: true, contributionId: contribution.id, status: "WAIVED" }
}

export async function getAjoGroupStatementData(groupId: string, userId: string) {
  const group = await getAjoGroupForUser(groupId, userId)
  if (!group) throw new Error("Group not found")
  if (group.creatorId !== userId) {
    throw new Error("Only the creator can export the group statement")
  }

  const contributions = await prisma.ajoContribution.findMany({
    where: { groupId },
    include: {
      user: { select: { id: true, name: true, phone: true, email: true } },
      cycle: { select: { cycleNumber: true } },
    },
    orderBy: [{ cycle: { cycleNumber: "asc" } }, { dueDate: "asc" }],
  })

  const payouts = await prisma.ajoPayout.findMany({
    where: { groupId },
    include: {
      recipient: { select: { id: true, name: true, phone: true, email: true } },
      cycle: { select: { cycleNumber: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return { group, contributions, payouts }
}
