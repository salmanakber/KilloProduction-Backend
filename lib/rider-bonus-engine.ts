import { RiderBonusChallengeStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { maybeTuneBonusWithAi } from "@/lib/rider-bonus-ai-tuning"

const PEAK_THRESHOLD = 1.2
const WINDOW_MS = 90 * 60 * 1000

function emitBonus(userId: string, payload: Record<string, unknown>) {
  try {
    getGlobalSocketServer().sendNotificationToUser(userId, {
      type: "rider_bonus_update",
      ...payload,
    })
  } catch {
    // socket may be unavailable in scripts
  }
}

async function avgCommissionProfitPerRide(): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const agg = await prisma.riderEarning.aggregate({
    where: {
      createdAt: { gte: since },
      type: "DELIVERY_FEE",
      commission: { gt: 0 },
    },
    _avg: { commission: true },
  })
  const v = agg._avg.commission
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v
  const s = await prisma.systemSettings.findFirst({ select: { ridingCommission: true } })
  return Math.max(1, (s?.ridingCommission ?? 15) * 2)
}

export async function processRiderBonusTick(): Promise<{ created: boolean; peakScore: number }> {
  const now = new Date()

  await prisma.riderPeakBonusChallenge.updateMany({
    where: {
      status: RiderBonusChallengeStatus.ACTIVE,
      windowEnd: { lt: now },
    },
    data: { status: RiderBonusChallengeStatus.EXPIRED },
  })

  const existingActive = await prisma.riderPeakBonusChallenge.findFirst({
    where: {
      status: RiderBonusChallengeStatus.ACTIVE,
      windowEnd: { gte: now },
    },
  })
  if (existingActive) {
    return { created: false, peakScore: existingActive.peakScore }
  }

  const [rideOpen, courierOpen, activeRiders] = await Promise.all([
    prisma.rideBooking.count({
      where: {
        riderId: null,
        status: { in: ["REQUESTED", "BIDDING"] },
      },
    }),
    prisma.courierBooking.count({
      where: {
        riderId: null,
        status: { in: ["REQUESTED", "BIDDING"] },
      },
    }),
    prisma.riderProfile.count({
      where: {
        isApproved: true,
        isAvailable: true,
      },
    }),
  ])

  const openRequests = rideOpen + courierOpen
  const supply = Math.max(1, activeRiders)
  const peakScore = openRequests / supply

  if (peakScore <= PEAK_THRESHOLD) {
    return { created: false, peakScore }
  }

  const profitPerRide = await avgCommissionProfitPerRide()
  const baselineRidesExpected = Math.max(1, activeRiders * 0.35 * (WINDOW_MS / (60 * 60 * 1000)))
  const expectedRidesWithBonus = Math.max(
    baselineRidesExpected,
    activeRiders * 0.9 * (WINDOW_MS / (60 * 60 * 1000))
  )
  const incrementalRides = Math.max(1, Math.floor(expectedRidesWithBonus - baselineRidesExpected))
  const bonusCapAmount = Math.round(incrementalRides * profitPerRide * 0.7 * 100) / 100
  const baselineTargetRides = Math.min(12, Math.max(2, Math.round(2 + peakScore * 2)))
  const baselineCommissionPct = Math.min(50, Math.round((peakScore - 1) * 25))

  const tuned = await maybeTuneBonusWithAi(
    { targetRides: baselineTargetRides, commissionDiscountPct: baselineCommissionPct },
    {
      peakScore,
      openRequests,
      activeRiders,
      profitPerRide,
    }
  )
  const targetRides = tuned.targetRides
  const commissionDiscountPct = tuned.commissionDiscountPct

  const windowStart = now
  const windowEnd = new Date(now.getTime() + WINDOW_MS)

  const challenge = await prisma.riderPeakBonusChallenge.create({
    data: {
      windowStart,
      windowEnd,
      peakScore,
      peakThreshold: PEAK_THRESHOLD,
      activeRidersSnapshot: activeRiders,
      openRequestsSnapshot: openRequests,
      targetRides,
      bonusCapAmount,
      commissionDiscountPct,
      baselineRidesExpected,
      incrementalRidesCap: incrementalRides,
      profitPerRideSnapshot: profitPerRide,
      status: RiderBonusChallengeStatus.ACTIVE,
    },
  })

  const eligible = await prisma.riderProfile.findMany({
    where: {
      isApproved: true,
      isAvailable: true,
      riderAssignedCancellationCount: { lt: 25 },
      OR: [{ totalRides: { lte: 5 } }, { completionRate: { gte: 0.45 } }],
    },
    select: { userId: true },
    take: 400,
  })

  for (const r of eligible) {
    await prisma.riderBonusParticipation.upsert({
      where: {
        challengeId_riderUserId: {
          challengeId: challenge.id,
          riderUserId: r.userId,
        },
      },
      create: {
        challengeId: challenge.id,
        riderUserId: r.userId,
        status: "INVITED",
      },
      update: {},
    })
    emitBonus(r.userId, {
      phase: "created",
      challenge: {
        id: challenge.id,
        windowEnd: challenge.windowEnd.toISOString(),
        targetRides: challenge.targetRides,
        bonusCapAmount: challenge.bonusCapAmount,
        commissionDiscountPct: challenge.commissionDiscountPct,
        peakScore: challenge.peakScore,
      },
    })
  }

  return { created: true, peakScore }
}

/**
 * Active peak bonus (ACCEPTED + in window): reduces platform take from rider commission by
 * `commissionDiscountPct` (capped at 50). Returns a multiplier in (0, 1] applied to commission amount.
 */
export async function getActivePeakBonusCommissionMultiplier(
  riderUserId: string
): Promise<number> {
  const now = new Date()
  const part = await prisma.riderBonusParticipation.findFirst({
    where: {
      riderUserId,
      status: "ACCEPTED",
      challenge: {
        status: RiderBonusChallengeStatus.ACTIVE,
        windowStart: { lte: now },
        windowEnd: { gte: now },
      },
    },
    include: { challenge: true },
  })
  if (!part) return 1
  const raw = Number(part.challenge.commissionDiscountPct)
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const pctOff = Math.min(50, Math.max(0, raw))
  return Math.round((1 - pctOff / 100) * 1e6) / 1e6
}

export async function bumpRiderBonusOnDeliveryEarning(riderUserId: string): Promise<void> {
  const now = new Date()
  const part = await prisma.riderBonusParticipation.findFirst({
    where: {
      riderUserId,
      status: "ACCEPTED",
      challenge: {
        status: RiderBonusChallengeStatus.ACTIVE,
        windowStart: { lte: now },
        windowEnd: { gte: now },
      },
    },
    include: { challenge: true },
  })
  if (!part) return

  const next = part.ridesCompleted + 1
  const done = next >= part.challenge.targetRides

  await prisma.riderBonusParticipation.update({
    where: { id: part.id },
    data: {
      ridesCompleted: next,
      ...(done
        ? {
            status: "COMPLETED",
            bonusPaid: part.challenge.bonusCapAmount,
          }
        : {}),
    },
  })

  emitBonus(riderUserId, {
    phase: "progress",
    ridesCompleted: next,
    targetRides: part.challenge.targetRides,
    challengeId: part.challenge.id,
  })

  if (done) {
    await prisma.riderEarning.create({
      data: {
        riderId: riderUserId,
        type: "BONUS",
        amount: part.challenge.bonusCapAmount,
        commission: 0,
        netAmount: part.challenge.bonusCapAmount,
        status: "PENDING",
        description: `Peak bonus challenge ${part.challenge.id}`,
      },
    })
    emitBonus(riderUserId, {
      phase: "completed",
      challengeId: part.challenge.id,
      bonusAmount: part.challenge.bonusCapAmount,
    })
  }
}
