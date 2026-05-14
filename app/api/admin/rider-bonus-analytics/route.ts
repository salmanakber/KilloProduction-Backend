import { type NextRequest, NextResponse } from "next/server"
import { RiderBonusChallengeStatus } from "@prisma/client"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { systemSettings } from "@/lib/systemSettings"

/**
 * Admin: peak bonus challenges, leaderboard, and response-time hints.
 * Challenge windows are created by `processRiderBonusTick` (food-rider-dispatch-worker).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const challengeId = searchParams.get("challengeId")

    const now = new Date()
    const system = await systemSettings()

    const activeChallenge = await prisma.riderPeakBonusChallenge.findFirst({
      where: {
        status: RiderBonusChallengeStatus.ACTIVE,
        windowEnd: { gte: now },
      },
      orderBy: { createdAt: "desc" },
    })

    const selectedChallenge =
      challengeId && challengeId.length > 0
        ? await prisma.riderPeakBonusChallenge.findUnique({
            where: { id: challengeId },
          })
        : activeChallenge

    const enrichParticipations = async (
      challenge: NonNullable<typeof activeChallenge>,
      parts: Array<{
        id: string
        riderUserId: string
        status: string
        ridesCompleted: number
        bonusPaid: number
        acceptedAt: Date | null
      }>
    ) => {
      const windowStart = challenge.windowStart.getTime()
      const windowEnd = challenge.windowEnd.getTime()

      const riderIds = Array.from(new Set(parts.map((p) => p.riderUserId))) as string[]
      const users = await prisma.user.findMany({
        where: { id: { in: riderIds } },
        select: { id: true, name: true, email: true, phone: true },
      })
      const userMap = new Map(users.map((u) => [u.id, u]))

      const leaderboard = await Promise.all(
        parts.map(async (p) => {
          const u = userMap.get(p.riderUserId)
          const lo = Math.max(windowStart, (p.acceptedAt ?? challenge.windowStart).getTime())
          const firstPaid = await prisma.riderEarning.findFirst({
            where: {
              riderId: p.riderUserId,
              type: "DELIVERY_FEE",
              status: "PAID",
              paidAt: {
                gte: new Date(lo),
                lte: new Date(windowEnd),
              },
            },
            orderBy: { paidAt: "asc" },
            select: { paidAt: true },
          })

          let minutesFromAcceptToFirstPaid: number | null = null
          if (firstPaid?.paidAt && p.acceptedAt) {
            minutesFromAcceptToFirstPaid =
              Math.round(((firstPaid.paidAt.getTime() - p.acceptedAt.getTime()) / 60000) * 10) / 10
          }

          return {
            participationId: p.id,
            riderUserId: p.riderUserId,
            riderName: u?.name ?? "—",
            riderEmail: u?.email ?? null,
            riderPhone: u?.phone ?? null,
            status: p.status,
            ridesCompleted: p.ridesCompleted,
            bonusPaid: p.bonusPaid,
            acceptedAt: p.acceptedAt?.toISOString() ?? null,
            minutesFromAcceptToFirstPaid,
            targetRides: challenge.targetRides,
          }
        })
      )

      leaderboard.sort((a, b) => b.ridesCompleted - a.ridesCompleted)
      return leaderboard
    }

    let focus: {
      challenge: {
        id: string
        windowStart: string
        windowEnd: string
        peakScore: number
        peakThreshold: number
        targetRides: number
        bonusCapAmount: number
        commissionDiscountPct: number
        activeRidersSnapshot: number
        openRequestsSnapshot: number
        profitPerRideSnapshot: number
        baselineRidesExpected: number
        incrementalRidesCap: number
        status: string
      } | null
      counts: { invited: number; accepted: number; completed: number; totalRidesProgress: number }
      leaderboard: Awaited<ReturnType<typeof enrichParticipations>>
    } | null = null

    if (selectedChallenge) {
      const [invited, accepted, completed, parts, sumProgress] = await Promise.all([
        prisma.riderBonusParticipation.count({
          where: { challengeId: selectedChallenge.id, status: "INVITED" },
        }),
        prisma.riderBonusParticipation.count({
          where: { challengeId: selectedChallenge.id, status: "ACCEPTED" },
        }),
        prisma.riderBonusParticipation.count({
          where: { challengeId: selectedChallenge.id, status: "COMPLETED" },
        }),
        prisma.riderBonusParticipation.findMany({
          where: { challengeId: selectedChallenge.id },
          select: {
            id: true,
            riderUserId: true,
            status: true,
            ridesCompleted: true,
            bonusPaid: true,
            acceptedAt: true,
          },
        }),
        prisma.riderBonusParticipation.aggregate({
          where: { challengeId: selectedChallenge.id },
          _sum: { ridesCompleted: true },
        }),
      ])

      const leaderboard = await enrichParticipations(selectedChallenge, parts)

      focus = {
        challenge: {
          id: selectedChallenge.id,
          windowStart: selectedChallenge.windowStart.toISOString(),
          windowEnd: selectedChallenge.windowEnd.toISOString(),
          peakScore: selectedChallenge.peakScore,
          peakThreshold: selectedChallenge.peakThreshold,
          targetRides: selectedChallenge.targetRides,
          bonusCapAmount: selectedChallenge.bonusCapAmount,
          commissionDiscountPct: selectedChallenge.commissionDiscountPct,
          activeRidersSnapshot: selectedChallenge.activeRidersSnapshot,
          openRequestsSnapshot: selectedChallenge.openRequestsSnapshot,
          profitPerRideSnapshot: selectedChallenge.profitPerRideSnapshot,
          baselineRidesExpected: selectedChallenge.baselineRidesExpected,
          incrementalRidesCap: selectedChallenge.incrementalRidesCap,
          status: selectedChallenge.status,
        },
        counts: {
          invited,
          accepted,
          completed,
          totalRidesProgress: sumProgress._sum.ridesCompleted ?? 0,
        },
        leaderboard,
      }
    }

    const recentChallenges = await prisma.riderPeakBonusChallenge.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        windowStart: true,
        windowEnd: true,
        peakScore: true,
        peakThreshold: true,
        targetRides: true,
        bonusCapAmount: true,
        status: true,
        activeRidersSnapshot: true,
        openRequestsSnapshot: true,
        _count: {
          select: { participations: true },
        },
      },
    })

    const recentWithStats = await Promise.all(
      recentChallenges.map(async (c) => {
        const [acceptedN, completedN, sumRides] = await Promise.all([
          prisma.riderBonusParticipation.count({
            where: { challengeId: c.id, status: "ACCEPTED" },
          }),
          prisma.riderBonusParticipation.count({
            where: { challengeId: c.id, status: "COMPLETED" },
          }),
          prisma.riderBonusParticipation.aggregate({
            where: { challengeId: c.id },
            _sum: { ridesCompleted: true, bonusPaid: true },
          }),
        ])
        return {
          id: c.id,
          createdAt: c.createdAt.toISOString(),
          windowStart: c.windowStart.toISOString(),
          windowEnd: c.windowEnd.toISOString(),
          peakScore: c.peakScore,
          peakThreshold: c.peakThreshold,
          targetRides: c.targetRides,
          bonusCapAmount: c.bonusCapAmount,
          status: c.status,
          activeRidersSnapshot: c.activeRidersSnapshot,
          openRequestsSnapshot: c.openRequestsSnapshot,
          participationsTotal: c._count.participations,
          acceptedCount: acceptedN,
          completedCount: completedN,
          ridesCompletedSum: sumRides._sum.ridesCompleted ?? 0,
          bonusPaidSum: sumRides._sum.bonusPaid ?? 0,
        }
      })
    )

    return NextResponse.json({
      generatedAt: now.toISOString(),
      worker:
        "Challenges are created by processRiderBonusTick (BullMQ worker / food-rider-dispatch-worker). Peak ratio = openRequests / online riders.",
      activeChallengeId: activeChallenge?.id ?? null,
      focus,
      recentChallenges: recentWithStats,
      currency: system.currency,
    })
  } catch (e) {
    console.error("[admin/rider-bonus-analytics]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
