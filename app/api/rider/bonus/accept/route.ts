import { type NextRequest, NextResponse } from "next/server"
import { RiderBonusChallengeStatus } from "@prisma/client"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : null
    if (!challengeId) {
      return NextResponse.json({ error: "challengeId required" }, { status: 400 })
    }

    const now = new Date()
    const challenge = await prisma.riderPeakBonusChallenge.findFirst({
      where: {
        id: challengeId,
        status: RiderBonusChallengeStatus.ACTIVE,
        windowEnd: { gte: now },
      },
    })
    if (!challenge) {
      console.error("[rider/bonus/accept] Challenge not available", challengeId)
      return NextResponse.json({ error: "Challenge not available" }, { status: 404 })
    }

    const profile = await prisma.riderProfile.findUnique({
      where: { userId: session.id },
      select: { riderAssignedCancellationCount: true, completionRate: true, totalRides: true },
    })
    if (
      !profile ||
      profile.riderAssignedCancellationCount >= 25 ||
      (profile.totalRides > 5 && (profile.completionRate ?? 0) < 0.45)
    ) {
      return NextResponse.json({ error: "Not eligible for this challenge" }, { status: 403 })
    }

    const row = await prisma.riderBonusParticipation.upsert({
      where: {
        challengeId_riderUserId: {
          challengeId,
          riderUserId: session.id,
        },
      },
      create: {
        challengeId,
        riderUserId: session.id,
        status: "ACCEPTED",
        acceptedAt: now,
      },
      update: {
        status: "ACCEPTED",
        acceptedAt: now,
      },
    })

    getGlobalSocketServer().sendNotificationToUser(session.id, {
      type: "rider_bonus_update",
      phase: "accepted",
      challengeId,
    })

    return NextResponse.json({ ok: true, participation: row })
  } catch (e) {
    console.error("[rider/bonus/accept]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
