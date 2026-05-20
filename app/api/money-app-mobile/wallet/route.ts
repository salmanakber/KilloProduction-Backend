import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  getDefaultSettlementMode,
  getSystemDefaultCurrency,
  listMoneyTransferWallets,
  sortMoneyTransferWallets,
} from "@/lib/money-transfer-wallet"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 20), 50)
    const currencyFilter = request.nextUrl.searchParams.get("currency")?.toUpperCase()

    const defaultCurrency = await getSystemDefaultCurrency()
    const wallets = sortMoneyTransferWallets(
      await listMoneyTransferWallets(user.id),
      defaultCurrency,
    )
    const primary =
      wallets.find((w) => w.currency === defaultCurrency) ?? wallets[0]

    const transactions = await prisma.moneyTransferWalletTransaction.findMany({
      where: {
        userId: user.id,
        ...(currencyFilter ? { currency: currencyFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    const defaultSettlementMode = await getDefaultSettlementMode()

    return NextResponse.json({
      success: true,
      defaultCurrency,
      wallets: wallets.map((w) => ({
        id: w.id,
        balance: w.balance,
        currency: w.currency,
        isActive: w.isActive,
      })),
      /** @deprecated use wallets[] — primary wallet (system default currency first) */
      wallet: primary
        ? {
            id: primary.id,
            balance: primary.balance,
            currency: primary.currency,
            isActive: primary.isActive,
          }
        : { id: null, balance: 0, currency: defaultCurrency, isActive: true },
      defaultSettlementMode,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        currency: t.currency,
        description: t.description,
        transferId: t.transferId,
        createdAt: t.createdAt,
      })),
    })
  } catch (error: any) {
    console.error("Money transfer wallet GET:", error)
    return NextResponse.json(
      { error: error.message || "Failed to load wallet" },
      { status: 500 },
    )
  }
}
