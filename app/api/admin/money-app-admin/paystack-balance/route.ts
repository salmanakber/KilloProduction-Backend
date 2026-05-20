import { NextRequest, NextResponse } from "next/server"
import {
  MoneyAdminAuthError,
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_AUDIT_ENTITY,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"
import { fetchPaystackIntegrationBalances } from "@/lib/money-transfer-paystack-admin"
import { fetchStripeMoneyBalances } from "@/lib/money-transfer-stripe-admin"
import { fetchVtpassWalletBalance } from "@/lib/vtpass"
import { prisma } from "@/lib/prisma"
import {
  getTreasuryBalanceHistory,
  recordTreasuryBalanceSnapshot,
} from "@/lib/treasury-balance-history"

export async function GET(request: NextRequest) {
  try {
    const { user, meta } = await requireMoneyTransferAdmin(request)

    let paystack: Awaited<ReturnType<typeof fetchPaystackIntegrationBalances>> | null = null
    let paystackError: string | null = null
    let stripe: Awaited<ReturnType<typeof fetchStripeMoneyBalances>> | null = null
    try {
      paystack = await fetchPaystackIntegrationBalances()
    } catch (e) {
      paystackError = e instanceof Error ? e.message : "Paystack unavailable"
    }
    stripe = await fetchStripeMoneyBalances()
    const vtpass = await fetchVtpassWalletBalance()

    const [walletLiabilities, pendingTransferPayouts, pendingWalletWithdrawals, openRefundCases, moneyCfg] =
      await Promise.all([
      prisma.moneyTransferWallet.groupBy({
        by: ["currency"],
        where: { isActive: true, balance: { gt: 0 } },
        _sum: { balance: true },
        _count: { _all: true },
      }),
      prisma.moneyTransferPayout.aggregate({
        where: { status: { in: ["PENDING", "PROCESSING"] } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.moneyWalletWithdrawal.aggregate({
        where: { status: { in: ["PENDING", "SCHEDULED", "PROCESSING"] } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.moneyTransferCase.count({
        where: {
          type: "REFUND_REQUEST",
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
      prisma.moneyTransferConfig.findFirst({
        select: { withdrawalSmartAutoApprove: true },
      }),
    ])

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_TRANSFER_VIEW_TREASURY",
      entityType: MONEY_TRANSFER_AUDIT_ENTITY,
      entityId: "treasury",
      details: { paystackConfigured: Boolean(paystack), paystackError },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    const ngnBalance =
      paystack?.balances.find((b) => b.currency === "NGN")?.balanceMajor ?? null

    const withdrawalSmartAutoApprove = moneyCfg?.withdrawalSmartAutoApprove ?? false
    const paystackLiquidityUnknown = paystackError != null || ngnBalance == null

    await recordTreasuryBalanceSnapshot({
      paystack: paystack?.balances ?? null,
      stripe: stripe?.balances ?? null,
      vtpassBalance: vtpass?.balance ?? null,
    })
    const balanceHistory = await getTreasuryBalanceHistory()

    return NextResponse.json({
      success: true,
      paystack,
      paystackError,
      stripe,
      vtpass,
      balanceHistory,
      topUpLinks: {
        paystack: "https://dashboard.paystack.com/",
        stripe: "https://dashboard.stripe.com/balance/overview",
        vtpass: "https://www.vtpass.com/vendor",
      },
      liquidity: {
        walletLiabilities: walletLiabilities.map((w) => ({
          currency: w.currency,
          totalBalance: w._sum.balance ?? 0,
          walletCount: w._count._all,
        })),
        pendingPayoutsAmount: pendingTransferPayouts._sum.amount ?? 0,
        pendingPayoutsCount:
          pendingTransferPayouts._count._all + pendingWalletWithdrawals._count._all,
        pendingTransferPayoutsCount: pendingTransferPayouts._count._all,
        pendingWalletWithdrawalsCount: pendingWalletWithdrawals._count._all,
        pendingWalletWithdrawalsAmount: pendingWalletWithdrawals._sum.amount ?? 0,
        openRefundCases,
        ngnPaystackAvailable: ngnBalance,
        refundCoverageOk:
          ngnBalance != null
            ? ngnBalance >= (pendingTransferPayouts._sum.amount ?? 0) / 100
            : null,
      },
      withdrawalSmart: {
        autoApproveEnabled: withdrawalSmartAutoApprove,
        paystackLiquidityUnknown,
        showWarning: withdrawalSmartAutoApprove && paystackLiquidityUnknown,
      },
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("paystack-balance:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load treasury" },
      { status: 500 },
    )
  }
}
