import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  assessMoneyTransferRisk,
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
    const action = (body.action || "MONEY_APP_OPEN") as MoneyRiskAction
    const client = readMoneyRiskClientContext(request, body)

    const assessment = await assessMoneyTransferRisk({
      userId: user.id,
      action,
      amount: body.amount,
      currency: body.currency,
      receiverId: body.receiverId,
      bankAccountId: body.bankAccountId,
      request,
      client,
    })

    return NextResponse.json({
      success: true,
      ...assessment,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Security check failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
