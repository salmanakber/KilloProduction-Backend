import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { computeWalletWithdrawalQuote } from "@/lib/money-wallet-withdrawal-quote"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const amount = parseFloat(searchParams.get("amount") || "")
    const walletCurrency = (searchParams.get("walletCurrency") || searchParams.get("currency") || "NGN")
      .trim()
      .toUpperCase()
      .slice(0, 3)
    let payoutCurrency = (searchParams.get("payoutCurrency") || "").trim().toUpperCase().slice(0, 3)
    const bankAccountId = searchParams.get("bankAccountId") || ""

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 })
    }

    if (!payoutCurrency && bankAccountId) {
      const bank = await prisma.bankAccount.findUnique({
        where: { id: bankAccountId },
        select: { userId: true, currency: true },
      })
      if (!bank || bank.userId !== user.id) {
        return NextResponse.json({ error: "Bank account not found" }, { status: 404 })
      }
      payoutCurrency = String(bank.currency || "NGN").toUpperCase().slice(0, 3)
    }

    if (!payoutCurrency) {
      return NextResponse.json({ error: "payoutCurrency or bankAccountId is required" }, { status: 400 })
    }

    const quote = await computeWalletWithdrawalQuote({
      walletAmount: amount,
      walletCurrency,
      payoutCurrency,
    })

    return NextResponse.json({ success: true, quote })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to compute quote"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
