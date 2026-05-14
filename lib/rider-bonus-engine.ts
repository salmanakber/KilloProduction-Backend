/**
 * Peak rider bonus — how the numbers are built (admin-tunable via SystemSettings + Admin → Riders → Bonus settings)
 *
 * 1) **Demand signal** — `peakScore = openRequests / max(1, activeOnlineRiders)`, where `openRequests` counts ride + courier
 *    bookings in REQUESTED/BIDDING with no rider yet, and `activeOnlineRiders` counts approved riders marked available.
 *
 * 2) **Window opens** — Only if `peakScore > demandThreshold` (default 1.2) AND no other ACTIVE challenge exists whose
 *    `windowEnd` is still in the future. Past-due ACTIVE rows are flipped to EXPIRED first.
 *
 * 3) **Profit per ride** — `avgCommissionProfitPerRide()` uses the 7-day average of rider `DELIVERY_FEE` earnings’
 *    `commission` field; if empty, it falls back to `ridingCommission × 2` from system settings (rough proxy).
 *    This value drives how *large* the bonus pool can be, not the ride target.
 *
 * 4) **Ride target (why you can see “12 rides” with a small bonus)** — Baseline target is
 *    `round(targetBase + peakScore × targetPeakScale)` then clamped to `[minTargetRides, maxTargetRides]` (defaults
 *    base 2, scale 2, min 2, max 12). So once `peakScore ≥ 5`, the raw formula is ≥ 12 and the **cap** pins at 12.
 *    That is *independent* of money: high demand ⇒ hard cap on rides. If the average commission sample is small,
 *    `bonusCapAmount` (below) stays small while the target can still be 12. **Lower `maxTargetRides` or `targetPeakScale`**
 *    in Bonus settings to soften targets; **raise `bonusProfitShare`** to increase the pool for the same incremental rides.
 *
 * 5) **Bonus pool cap** — Estimated extra rides the market might complete during the window:
 *    `incrementalRides = floor(expectedWithBonus − baselineExpected)` (minimum 1), where each expected count is
 *    `activeRiders × utilPerRiderPerHour × windowHours` using baseline vs expected util rates (defaults 0.35 vs 0.9).
 *    Then `bonusCapAmount = round(incrementalRides × profitPerRide × bonusProfitShare × 100) / 100` (default share 0.7).
 *
 * 6) **Commission discount** — `min(50, round((peakScore − 1) × commissionPeakFactor))` (default factor 25). Applied
 *    as a multiplier on platform commission while the rider is **INVITED or ACCEPTED** on an ACTIVE challenge in the window
 *    (INVITED riders are auto-enrolled when the challenge spawns; they do not need a separate accept for progress/discount).
 *
 * 7) **Optional AI** — If rider bonus AI is enabled, a tiny model pass may nudge `{targetRides, commissionDiscountPct}`
 *    but still clamps to your min/max target bounds.
 *
 * 8) **Completion payout** — When the rider hits `targetRides` inside the window, `bumpRiderBonusOnDeliveryEarning` runs an
 *    atomic transaction: participation → COMPLETED, `RiderEarning` (BONUS, PAID), `WalletTransaction` (BONUS, COMPLETED),
 *    `Payment` (PAID, gateway PLATFORM), and ledger `Transaction` (WALLET_TOPUP), idempotent on `peak-bonus:{challengeId}:{riderId}`.
 */
import { RiderBonusChallengeStatus, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { maybeTuneBonusWithAi } from "@/lib/rider-bonus-ai-tuning"
import { getRiderPeakBonusNumericSettings } from "@/lib/rider-peak-bonus-settings"

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

const peakBonusWalletRef = (challengeId: string, riderUserId: string) =>
  `peak-bonus:${challengeId}:${riderUserId}`

/**
 * Credits rider wallet (WalletTransaction), ledger Transaction, Payment, and RiderEarning — idempotent by `reference`.
 */
async function finalizePeakBonusPayout(
  tx: Prisma.TransactionClient,
  params: { riderUserId: string; challengeId: string; amount: number; participationId: string }
): Promise<void> {
  const { riderUserId, challengeId, participationId } = params
  const rounded = Math.round(Number(params.amount) * 100) / 100
  const ref = peakBonusWalletRef(challengeId, riderUserId)
  const desc = `Peak bonus challenge ${challengeId}`

  const existingWt = await tx.walletTransaction.findFirst({
    where: { userId: riderUserId, reference: ref },
  })
  if (existingWt?.status === "COMPLETED") {
    const pendingOld = await tx.riderEarning.findFirst({
      where: { riderId: riderUserId, type: "BONUS", description: desc, status: "PENDING" },
    })
    if (pendingOld && Number.isFinite(rounded) && rounded > 0) {
      await tx.riderEarning.update({
        where: { id: pendingOld.id },
        data: {
          amount: rounded,
          netAmount: rounded,
          status: "PAID",
          paidAt: new Date(),
        },
      })
      return
    }
    const er = await tx.riderEarning.findFirst({
      where: { riderId: riderUserId, type: "BONUS", description: desc },
    })
    if (!er && Number.isFinite(rounded) && rounded > 0) {
      await tx.riderEarning.create({
        data: {
          riderId: riderUserId,
          type: "BONUS",
          amount: rounded,
          commission: 0,
          netAmount: rounded,
          status: "PAID",
          paidAt: new Date(),
          description: desc,
        },
      })
    }
    return
  }

  if (existingWt) {
    await tx.walletTransaction.delete({ where: { id: existingWt.id } })
  }

  if (!Number.isFinite(rounded) || rounded <= 0) {
    await tx.riderEarning.create({
      data: {
        riderId: riderUserId,
        type: "BONUS",
        amount: 0,
        commission: 0,
        netAmount: 0,
        status: "PAID",
        paidAt: new Date(),
        description: `${desc} (no payout amount)`,
      },
    })
    return
  }

  let wallet = await tx.wallet.findUnique({ where: { userId: riderUserId } })
  if (!wallet) {
    const cur = await tx.currency.findFirst({ where: { isDefault: true }, select: { code: true } })
    const currency = cur?.code || "NGN"
    wallet = await tx.wallet.create({
      data: { userId: riderUserId, balance: 0, currency },
    })
  }

  const newBalance = Math.round((wallet.balance + rounded) * 100) / 100

  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: newBalance },
  })

  await tx.walletTransaction.create({
    data: {
      userId: riderUserId,
      type: "BONUS",
      amount: rounded,
      balance: newBalance,
      description: "Peak hours challenge bonus",
      reference: ref,
      status: "COMPLETED",
      metadata: { transactionType: "RIDER_PEAK_BONUS", challengeId },
    },
  })

  const existPay = await tx.payment.findFirst({ where: { gatewayTransactionId: ref } })
  if (!existPay) {
    await tx.payment.create({
      data: {
        userId: riderUserId,
        amount: rounded,
        currency: wallet.currency,
        status: "PAID",
        gateway: "PLATFORM",
        gatewayTransactionId: ref,
        description: "Peak hours challenge bonus",
        metadata: {
          type: "RIDER_PEAK_BONUS",
          challengeId,
          participationId,
        },
      },
    })
  }

  const existLedger = await tx.transaction.findFirst({ where: { reference: ref } })
  if (!existLedger) {
    await tx.transaction.create({
      data: {
        userId: riderUserId,
        walletId: wallet.id,
        type: "WALLET_TOPUP",
        amount: rounded,
        currency: wallet.currency,
        status: "COMPLETED",
        description: "Peak hours challenge — wallet credit",
        reference: ref,
        metadata: { challengeId, kind: "RIDER_PEAK_BONUS" },
      },
    })
  }

  const pendingBonus = await tx.riderEarning.findFirst({
    where: { riderId: riderUserId, type: "BONUS", description: desc, status: "PENDING" },
  })
  if (pendingBonus) {
    await tx.riderEarning.update({
      where: { id: pendingBonus.id },
      data: {
        amount: rounded,
        netAmount: rounded,
        status: "PAID",
        paidAt: new Date(),
      },
    })
    return
  }

  const existEarning = await tx.riderEarning.findFirst({
    where: { riderId: riderUserId, type: "BONUS", description: desc },
  })
  if (!existEarning) {
    await tx.riderEarning.create({
      data: {
        riderId: riderUserId,
        type: "BONUS",
        amount: rounded,
        commission: 0,
        netAmount: rounded,
        status: "PAID",
        paidAt: new Date(),
        description: desc,
      },
    })
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
  const cfg = await getRiderPeakBonusNumericSettings()
  const windowMs = cfg.windowMinutes * 60 * 1000
  const hourMs = 60 * 60 * 1000
  const windowHours = windowMs / hourMs

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

  if (peakScore <= cfg.demandThreshold) {
    return { created: false, peakScore }
  }

  const profitPerRide = await avgCommissionProfitPerRide()
  const baselineRidesExpected = Math.max(1, activeRiders * cfg.baselineUtilPerHour * windowHours)
  const expectedRidesWithBonus = Math.max(
    baselineRidesExpected,
    activeRiders * cfg.expectedUtilPerHour * windowHours
  )
  const incrementalRides = Math.max(1, Math.floor(expectedRidesWithBonus - baselineRidesExpected))
  const bonusCapAmount =
    Math.round(incrementalRides * profitPerRide * cfg.bonusProfitShare * 100) / 100
  const baselineTargetRides = Math.min(
    cfg.maxTargetRides,
    Math.max(cfg.minTargetRides, Math.round(cfg.targetBase + peakScore * cfg.targetPeakScale))
  )
  const baselineCommissionPct = Math.min(50, Math.round((peakScore - 1) * cfg.commissionPeakFactor))

  const tuned = await maybeTuneBonusWithAi(
    { targetRides: baselineTargetRides, commissionDiscountPct: baselineCommissionPct },
    {
      peakScore,
      openRequests,
      activeRiders,
      profitPerRide,
      minTargetRides: cfg.minTargetRides,
      maxTargetRides: cfg.maxTargetRides,
    }
  )
  const targetRides = tuned.targetRides
  const commissionDiscountPct = tuned.commissionDiscountPct

  const windowStart = now
  const windowEnd = new Date(now.getTime() + windowMs)

  const challenge = await prisma.riderPeakBonusChallenge.create({
    data: {
      windowStart,
      windowEnd,
      peakScore,
      peakThreshold: cfg.demandThreshold,
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
 * Active peak bonus (INVITED or ACCEPTED + in window): reduces platform take from rider commission by
 * `commissionDiscountPct` (capped at 50). Returns a multiplier in (0, 1] applied to commission amount.
 *
 * Participations are created as INVITED when a challenge opens; riders who never call `/rider/bonus/accept`
 * still count toward the challenge and receive the discount while the window is open.
 */
export async function getActivePeakBonusCommissionMultiplier(
  riderUserId: string
): Promise<number> {
  const now = new Date()
  const part = await prisma.riderBonusParticipation.findFirst({
    where: {
      riderUserId,
      status: { in: ["INVITED", "ACCEPTED"] },
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
  /** Rows are created INVITED when a challenge opens; progress must not depend on POST /rider/bonus/accept. */
  const part = await prisma.riderBonusParticipation.findFirst({
    where: {
      riderUserId,
      status: { in: ["INVITED", "ACCEPTED"] },
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
  const challengeId = part.challenge.id
  const bonusAmount = Number(part.challenge.bonusCapAmount) || 0

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.riderBonusParticipation.updateMany({
        where: {
          id: part.id,
          status: { in: ["INVITED", "ACCEPTED"] },
          ridesCompleted: part.ridesCompleted,
        },
        data: {
          ridesCompleted: next,
          ...(done
            ? {
                status: "COMPLETED",
                bonusPaid: part.challenge.bonusCapAmount,
                ...(!part.acceptedAt ? { acceptedAt: now } : {}),
              }
            : {
                status: "ACCEPTED",
                ...(!part.acceptedAt ? { acceptedAt: now } : {}),
              }),
        },
      })
      if (updated.count === 0) return

      if (done) {
        await finalizePeakBonusPayout(tx, {
          riderUserId,
          challengeId,
          amount: bonusAmount,
          participationId: part.id,
        })
      }
    })
  } catch (err) {
    console.error("[bumpRiderBonusOnDeliveryEarning] transaction failed", err)
    throw err
  }

  emitBonus(riderUserId, {
    phase: "progress",
    ridesCompleted: next,
    targetRides: part.challenge.targetRides,
    challengeId,
  })

  if (part.status === "INVITED") {
    emitBonus(riderUserId, {
      type: "rider_bonus_update",
      phase: "accepted",
      challengeId,
    })
  }

  if (done) {
    emitBonus(riderUserId, {
      phase: "completed",
      challengeId,
      bonusAmount: part.challenge.bonusCapAmount,
      targetRides: part.challenge.targetRides,
    })
  }
}
