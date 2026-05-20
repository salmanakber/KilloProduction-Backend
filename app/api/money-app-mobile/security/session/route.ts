import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  assessMoneyTransferRisk,
  assertValidMoneyStepUp,
  readMoneyRiskClientContext,
} from "@/lib/money-transfer-risk"
import type { MoneyRiskAction } from "@/lib/money-transfer-risk"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const action = (request.nextUrl.searchParams.get("action") ||
      "MONEY_APP_OPEN") as MoneyRiskAction
    const client = readMoneyRiskClientContext(request)
    const stepUpToken = request.headers.get("x-money-step-up-token")

    const assessment = await assessMoneyTransferRisk({
      userId: user.id,
      action,
      request,
      client,
    })

    let verified = !assessment.requiresStepUp && !assessment.blocked

    if (assessment.requiresStepUp && stepUpToken) {
      try {
        await assertValidMoneyStepUp({
          userId: user.id,
          stepUpToken,
          action,
        })
        verified = true
      } catch {
        verified = false
      }
    }

    return NextResponse.json({
      success: true,
      verified,
      blocked: assessment.blocked,
      requiresStepUp: assessment.requiresStepUp,
      signals: assessment.signals,
      message: assessment.message,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Session check failed"
    return NextResponse.json({
      success: true,
      verified: false,
      blocked: false,
      requiresStepUp: true,
      signals: [],
      message,
    })
  }
}
