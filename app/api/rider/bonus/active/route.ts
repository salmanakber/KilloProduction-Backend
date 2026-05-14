import { type NextRequest, NextResponse } from "next/server"
import { RiderBonusChallengeStatus } from "@prisma/client"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/** Current rider bonus challenge + participation (if any). */
export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    const challenge = await prisma.riderPeakBonusChallenge.findFirst({
      where: {
        status: RiderBonusChallengeStatus.ACTIVE,
        windowEnd: { gte: now },
      },
      orderBy: { createdAt: "desc" },
    })

    if (!challenge) {
      return NextResponse.json({ challenge: null, participation: null })
    }

    const participation = await prisma.riderBonusParticipation.findUnique({
      where: {
        challengeId_riderUserId: {
          challengeId: challenge.id,
          riderUserId: session.id,
        },
      },
    })

    return NextResponse.json({
      challenge: {
        id: challenge.id,
        windowStart: challenge.windowStart.toISOString(),
        windowEnd: challenge.windowEnd.toISOString(),
        peakScore: challenge.peakScore,
        targetRides: challenge.targetRides,
        bonusCapAmount: challenge.bonusCapAmount,
        commissionDiscountPct: challenge.commissionDiscountPct,
      },
      participation: participation
        ? {
            status: participation.status,
            ridesCompleted: participation.ridesCompleted,
            acceptedAt: participation.acceptedAt?.toISOString() ?? null,
            bonusPaid: participation.bonusPaid,
          }
        : null,
    })
  } catch (e) {
    console.error("[rider/bonus/active]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
