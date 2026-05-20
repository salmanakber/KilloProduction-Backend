import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { getOrCreateMoneyTransferWallet } from "@/lib/money-transfer-wallet"
import { submitWalletWithdrawalFromMobile } from "@/lib/money-wallet-withdrawal"
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
    const { amount, bankAccountId, currency = "NGN", expectedPayoutAmount } = body

    try {
      await enforceMoneyTransferSecurity({
        userId: user.id,
        action: "WALLET_WITHDRAW",
        request,
        body,
        amount,
        currency,
        bankAccountId,
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

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 })
    }
    if (!bankAccountId) {
      return NextResponse.json({ error: "Bank account ID is required" }, { status: 400 })
    }

    const wallet = await getOrCreateMoneyTransferWallet(user.id, currency)
    if (wallet.balance < amount) {
      return NextResponse.json(
        {
          error: `Insufficient balance. Available: ${wallet.currency} ${wallet.balance.toFixed(2)}`,
        },
        { status: 400 },
      )
    }

    const { withdrawal, settings, quote } = await submitWalletWithdrawalFromMobile({
      userId: user.id,
      amount,
      currency,
      bankAccountId,
      expectedPayoutAmount:
        expectedPayoutAmount != null ? Number(expectedPayoutAmount) : undefined,
    })

    const updatedWallet = await getOrCreateMoneyTransferWallet(user.id, currency)

    const payoutLabel = `${quote.payoutCurrency} ${quote.payoutAmount.toFixed(2)}`
    const message = settings.autoPayoutEnabled
      ? `Withdrawal queued. ${payoutLabel} will be sent to your bank in about ${settings.autoPayoutDelayMinutes} minutes.`
      : `Withdrawal submitted. You will receive ${payoutLabel} after review.`

    return NextResponse.json({
      success: true,
      wallet: { balance: updatedWallet.balance, currency: updatedWallet.currency },
      withdrawal: {
        id: withdrawal.id,
        status: withdrawal.status,
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        walletDebitAmount: quote.walletAmount,
        walletDebitCurrency: quote.walletCurrency,
        scheduledProcessAt: withdrawal.scheduledProcessAt,
        autoPayout: settings.autoPayoutEnabled,
      },
      quote,
      message,
    })
  } catch (error: unknown) {
    console.error("Wallet withdraw error:", error)
    const message = error instanceof Error ? error.message : "Failed to process withdrawal"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
