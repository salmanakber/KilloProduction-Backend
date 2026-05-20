import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  createMoneyCardSetupIntent,
  listMoneySavedCards,
  saveMoneyCardFromPaymentIntent,
  saveMoneyCardFromSetupIntent,
} from "@/lib/money-transfer-stripe-cards"
import { enforceMoneyTransferSecurity, MoneyRiskStepUpRequired, MoneyRiskBlocked } from "@/lib/money-transfer-risk"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const cards = await listMoneySavedCards(user.id)
    return NextResponse.json({
      success: true,
      cards: cards.map((c) => ({
        id: c.id,
        last4: c.last4 || c.lastFour,
        brand: c.brand,
        expiryMonth: c.expiryMonth,
        expiryYear: c.expiryYear,
        isDefault: c.isDefault,
      })),
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const action = body.action as string

    try {
      await enforceMoneyTransferSecurity({
        userId: user.id,
        action: "SEND_MONEY",
        request,
        body,
      })
    } catch (riskErr) {
      if (riskErr instanceof MoneyRiskBlocked || riskErr instanceof MoneyRiskStepUpRequired) {
        return NextResponse.json(
          { error: riskErr.message, requiresStepUp: riskErr instanceof MoneyRiskStepUpRequired },
          { status: 403 },
        )
      }
      throw riskErr
    }

    if (action === "setup") {
      const setup = await createMoneyCardSetupIntent(user.id)
      return NextResponse.json({ success: true, ...setup })
    }

    if (action === "save") {
      const { setupIntentId } = body
      if (!setupIntentId) {
        return NextResponse.json({ error: "setupIntentId required" }, { status: 400 })
      }
      const card = await saveMoneyCardFromSetupIntent(user.id, setupIntentId)
      return NextResponse.json({ success: true, card })
    }

    if (action === "save_from_payment") {
      const { paymentIntentId } = body
      if (!paymentIntentId) {
        return NextResponse.json({ error: "paymentIntentId required" }, { status: 400 })
      }
      const card = await saveMoneyCardFromPaymentIntent(user.id, paymentIntentId)
      return NextResponse.json({ success: true, card })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
