import { type NextRequest, NextResponse } from "next/server"
import { RiderBonusChallengeStatus } from "@prisma/client"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import { prisma } from "@/lib/prisma"

type ParticipationRow = {
  id: string
  challengeId: string
  status: string
  ridesCompleted: number
  bonusPaid: number
  updatedAt: Date
  challenge: {
    id: string
    windowStart: Date
    windowEnd: Date
    targetRides: number
    bonusCapAmount: number
    status: RiderBonusChallengeStatus
  }
}

function classifyHistoryRow(
  p: ParticipationRow,
  activeChallengeId: string | null,
  now: Date
): { include: boolean; displayStatus: "COMPLETED" | "FAILED" | "ABANDONED" } | null {
  const windowEnd = p.challenge.windowEnd.getTime()
  const windowActive = windowEnd >= now.getTime()

  if (p.status === "COMPLETED") {
    return { include: true, displayStatus: "COMPLETED" }
  }

  if (windowActive && p.challengeId === activeChallengeId) {
    if (p.status === "INVITED" || p.status === "ACCEPTED") {
      return null
    }
  }

  if (!windowActive) {
    if (p.status === "INVITED") {
      return { include: true, displayStatus: "ABANDONED" }
    }
    if (p.status === "ACCEPTED" && p.ridesCompleted < p.challenge.targetRides) {
      return { include: true, displayStatus: "FAILED" }
    }
    if (p.status === "ACCEPTED") {
      return { include: true, displayStatus: "COMPLETED" }
    }
  }

  return null
}

function accumulateStats(
  rows: ParticipationRow[],
  activeChallengeId: string | null,
  now: Date
): { completed: number; failed: number; abandoned: number; totalWon: number; successRate: number | null } {
  let completed = 0
  let failed = 0
  let abandoned = 0
  let totalWon = 0

  for (const p of rows) {
    const windowEnd = p.challenge.windowEnd.getTime()
    const ended = windowEnd < now.getTime()

    if (p.status === "COMPLETED") {
      completed += 1
      totalWon += Number(p.bonusPaid) || 0
      continue
    }

    if (!ended && p.challengeId === activeChallengeId && (p.status === "INVITED" || p.status === "ACCEPTED")) {
      continue
    }

    if (ended && p.status === "INVITED") {
      abandoned += 1
      continue
    }

    if (ended && p.status === "ACCEPTED") {
      if (p.ridesCompleted >= p.challenge.targetRides) {
        completed += 1
        totalWon += Number(p.bonusPaid) || 0
      } else {
        failed += 1
      }
    }
  }

  const denom = completed + failed + abandoned
  const successRate = denom === 0 ? null : Math.round((completed / denom) * 100)

  return { completed, failed, abandoned, totalWon, successRate }
}

/** Past peak bonus participations + aggregate stats for the signed-in rider. */
export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

    const now = new Date()

    /** UTC midnight seven days ago through now: challenges overlapping this range (last week + today). */
    const rangeStart = new Date(now)
    rangeStart.setUTCHours(0, 0, 0, 0)
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 7)

    const activeChallenge = await prisma.riderPeakBonusChallenge.findFirst({
      where: {
        status: RiderBonusChallengeStatus.ACTIVE,
        windowEnd: { gte: now },
      },
      select: { id: true },
    })
    const activeChallengeId = activeChallenge?.id ?? null

    const rows = await prisma.riderBonusParticipation.findMany({
      where: {
        riderUserId: session.id,
        challenge: {
          windowEnd: { gte: rangeStart },
          windowStart: { lte: now },
        },
      },
      include: {
        challenge: {
          select: {
            id: true,
            windowStart: true,
            windowEnd: true,
            targetRides: true,
            bonusCapAmount: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 60,
    })

    const stats = accumulateStats(rows as ParticipationRow[], activeChallengeId, now)

    const items: Array<{
      id: string
      challengeId: string
      windowStart: string
      windowEnd: string
      targetRides: number
      ridesCompleted: number
      bonusPaid: number
      displayStatus: "COMPLETED" | "FAILED" | "ABANDONED"
      challengeStatus: RiderBonusChallengeStatus
    }> = []

    for (const p of rows as ParticipationRow[]) {
      const meta = classifyHistoryRow(p, activeChallengeId, now)
      if (!meta?.include) continue
      items.push({
        id: p.id,
        challengeId: p.challengeId,
        windowStart: p.challenge.windowStart.toISOString(),
        windowEnd: p.challenge.windowEnd.toISOString(),
        targetRides: p.challenge.targetRides,
        ridesCompleted: p.ridesCompleted,
        bonusPaid: p.bonusPaid,
        displayStatus: meta.displayStatus,
        challengeStatus: p.challenge.status,
      })
      if (items.length >= 30) break
    }

    return NextResponse.json({
      items,
      stats,
      range: { from: rangeStart.toISOString(), to: now.toISOString() },
    })
  } catch (e) {
    console.error("[rider/bonus/history]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
