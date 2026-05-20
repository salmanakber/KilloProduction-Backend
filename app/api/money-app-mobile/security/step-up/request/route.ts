import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  assessMoneyTransferRisk,
  createMoneyStepUpChallenge,
  readMoneyRiskClientContext,
  type MoneyRiskAction,
} from "@/lib/money-transfer-risk"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const action = (body.action || "SEND_MONEY") as MoneyRiskAction
    const client = readMoneyRiskClientContext(request, body)

    const assessment = await assessMoneyTransferRisk({
      userId: user.id,
      action,
      amount: body.amount,
      receiverId: body.receiverId,
      request,
      client,
    })

    if (assessment.blocked) {
      return NextResponse.json(
        { error: assessment.message, blocked: true, signals: assessment.signals },
        { status: 403 },
      )
    }

    const challenge = await createMoneyStepUpChallenge({
      userId: user.id,
      action,
      deviceFingerprint: client.deviceFingerprint,
      signals: assessment.signals,
      riskScore: assessment.riskScore,
    })

    return NextResponse.json({
      success: true,
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt.toISOString(),
      message: "Verification code sent to your registered phone.",
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send code"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
