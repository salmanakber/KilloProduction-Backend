import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { verifyMoneyStepUp } from "@/lib/money-transfer-risk"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { challengeId, code, trustDevice, deviceFingerprint, deviceLabel, platform } = body

    if (!challengeId || !code) {
      return NextResponse.json({ error: "challengeId and code are required" }, { status: 400 })
    }

    const result = await verifyMoneyStepUp({
      userId: user.id,
      challengeId,
      code: String(code),
      trustDevice: Boolean(trustDevice),
      deviceFingerprint,
      deviceLabel,
      platform,
    })

    return NextResponse.json({
      success: true,
      stepUpToken: result.stepUpToken,
      expiresAt: result.expiresAt.toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Verification failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
