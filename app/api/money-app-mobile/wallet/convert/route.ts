import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { executeWalletConvert } from "@/lib/money-wallet-convert"
import {
  enforceMoneyTransferSecurity,
  MoneyRiskBlocked,
  MoneyRiskStepUpRequired,
} from "@/lib/money-transfer-risk"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const fromAmount = Number(body.amount ?? body.fromAmount)
    const fromCurrency = String(body.fromCurrency || body.currency || "").trim().toUpperCase().slice(0, 3)
    const toCurrency = String(body.toCurrency || "").trim().toUpperCase().slice(0, 3)
    const expectedToAmount =
      body.expectedToAmount != null ? Number(body.expectedToAmount) : undefined

    try {
      await enforceMoneyTransferSecurity({
        userId: user.id,
        action: "WALLET_WITHDRAW",
        request,
        body,
        amount: fromAmount,
        currency: fromCurrency,
      })
    } catch (riskErr) {
      if (riskErr instanceof MoneyRiskBlocked) {
        return NextResponse.json(
          { error: riskErr.message, blocked: true, code: riskErr.code },
          { status: 403 },
        )
      }
      if (riskErr instanceof MoneyRiskStepUpRequired) {
        return NextResponse.json(
          { error: riskErr.message, requiresStepUp: true, code: riskErr.code },
          { status: 403 },
        )
      }
      throw riskErr
    }

    if (!Number.isFinite(fromAmount) || fromAmount <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 })
    }
    if (!fromCurrency || !toCurrency) {
      return NextResponse.json({ error: "fromCurrency and toCurrency are required" }, { status: 400 })
    }

    const result = await executeWalletConvert({
      userId: user.id,
      fromCurrency,
      toCurrency,
      fromAmount,
      expectedToAmount,
    })

    return NextResponse.json({
      success: true,
      quote: result.quote,
      sourceWallet: result.sourceWallet,
      destWallet: result.destWallet,
      debitTransactionId: result.debitTransactionId,
      creditTransactionId: result.creditTransactionId,
      message: `Converted ${result.quote.fromCurrency} ${result.quote.fromAmount.toFixed(2)} to ${result.quote.toCurrency} ${result.quote.toAmount.toFixed(2)}`,
    })
  } catch (error: unknown) {
    console.error("Wallet convert error:", error)
    const message = error instanceof Error ? error.message : "Failed to convert balance"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
