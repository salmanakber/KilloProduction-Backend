import { MoneyWalletWithdrawalStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { logMoneyTransferAdminAction, MONEY_TRANSFER_AUDIT_ENTITY } from "@/lib/money-transfer-admin"
import { debitMoneyTransferWalletForWithdrawal } from "@/lib/money-transfer-wallet"
import { computeWalletWithdrawalQuote } from "@/lib/money-wallet-withdrawal-quote"
import { NotificationBridge } from "@/lib/notification-bridge"
import { fetchPaystackIntegrationBalances } from "@/lib/money-transfer-paystack-admin"

export { computeWalletWithdrawalQuote } from "@/lib/money-wallet-withdrawal-quote"
export type { WalletWithdrawalQuote } from "@/lib/money-wallet-withdrawal-quote"

const MAX_WITHDRAWALS_PER_DAY = 5
const MAX_DAILY_WITHDRAWAL_AMOUNT_NGN = 5_000_000

export async function getMoneyTransferPayoutSettings() {
  const config = await prisma.moneyTransferConfig.findFirst({
    select: {
      autoPayoutEnabled: true,
      autoPayoutDelayMinutes: true,
      isEnabled: true,
      withdrawalSmartAutoApprove: true,
      withdrawalSmartApproveDelayMinutes: true,
      withdrawalPaystackBufferNgn: true,
      withdrawalInstantMaxNgn: true,
    },
  })
  return {
    autoPayoutEnabled: config?.autoPayoutEnabled ?? false,
    autoPayoutDelayMinutes: Math.min(
      60,
      Math.max(10, config?.autoPayoutDelayMinutes ?? 12),
    ),
    moduleEnabled: config?.isEnabled ?? true,
    withdrawalSmartAutoApprove: config?.withdrawalSmartAutoApprove ?? false,
    withdrawalSmartApproveDelayMinutes: Math.min(
      120,
      Math.max(1, config?.withdrawalSmartApproveDelayMinutes ?? 15),
    ),
    withdrawalPaystackBufferNgn: Math.max(0, config?.withdrawalPaystackBufferNgn ?? 50_000),
    withdrawalInstantMaxNgn:
      config?.withdrawalInstantMaxNgn != null && Number.isFinite(config.withdrawalInstantMaxNgn)
        ? config.withdrawalInstantMaxNgn
        : null,
  }
}

async function getPaystackSecretKey(): Promise<string> {
  const config = await prisma.moneyTransferConfig.findFirst({
    select: { paystackSecretKey: true },
  })
  if (config?.paystackSecretKey) return config.paystackSecretKey
  if (process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY) {
    return process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY
  }
  throw new Error("Money Transfer Paystack configuration not found")
}

/** Layer 1–3 fraud / abuse checks before queueing or paying out. */
export async function assertWithdrawalSecurity(args: {
  userId: string
  walletAmount: number
  walletCurrency: string
  payoutAmount: number
  payoutCurrency: string
  bankAccountId: string
}) {
  const { userId, walletAmount, walletCurrency, payoutAmount, payoutCurrency, bankAccountId } =
    args
  if (walletAmount <= 0) throw new Error("Invalid withdrawal amount")
  if (payoutAmount <= 0) throw new Error("Invalid payout amount")

  const bank = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } })
  if (!bank || bank.userId !== userId) {
    throw new Error("Bank account not found")
  }
  if (!bank.isVerified) {
    throw new Error("Bank account must be verified before withdrawal")
  }
  const bankCurrency = String(bank.currency || "NGN").toUpperCase().slice(0, 3)
  const payout = String(payoutCurrency).toUpperCase().slice(0, 3)
  if (bankCurrency !== payout) {
    throw new Error(
      `This bank account is registered for ${bankCurrency} payouts. Select a matching account or add a ${payout} bank account.`,
    )
  }

  const openPending = await prisma.moneyWalletWithdrawal.count({
    where: {
      userId,
      status: { in: ["PENDING", "SCHEDULED", "PROCESSING"] },
    },
  })
  if (openPending > 0) {
    throw new Error("You already have a withdrawal in progress. Please wait for it to complete.")
  }

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const today = await prisma.moneyWalletWithdrawal.findMany({
    where: {
      userId,
      createdAt: { gte: dayStart },
      status: { notIn: ["CANCELLED", "REJECTED"] },
    },
    select: { amount: true, currency: true },
  })
  if (today.length >= MAX_WITHDRAWALS_PER_DAY) {
    throw new Error(`Daily withdrawal limit reached (${MAX_WITHDRAWALS_PER_DAY} requests).`)
  }
  const todayNgn = today
    .filter((r) => r.currency === "NGN")
    .reduce((s, r) => s + r.amount, 0)
  if (payout === "NGN" && todayNgn + payoutAmount > MAX_DAILY_WITHDRAWAL_AMOUNT_NGN) {
    throw new Error("Daily withdrawal amount limit exceeded.")
  }
}

export async function paystackSendWithdrawal(args: {
  bankName: string
  accountNumber: string
  accountName: string
  bankCode: string
  amount: number
  currency: string
  reference: string
}) {
  if (args.currency !== "NGN") {
    throw new Error(`Automatic bank payout is only supported for NGN (requested ${args.currency})`)
  }
  const secretKey = await getPaystackSecretKey()
  const recipientResponse = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: args.accountName,
      account_number: args.accountNumber,
      bank_code: args.bankCode,
      currency: "NGN",
    }),
  })
  const recipientData = await recipientResponse.json()
  if (!recipientData.status) {
    throw new Error(recipientData.message || "Failed to create Paystack recipient")
  }

  const transferResponse = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(args.amount * 100),
      recipient: recipientData.data.recipient_code,
      reference: args.reference,
      reason: `Kilo wallet withdrawal: ${args.reference}`,
    }),
  })
  const transferData = await transferResponse.json()
  if (!transferData.status) {
    throw new Error(transferData.message || "Paystack transfer failed")
  }
  return {
    paystackReference: transferData.data.reference as string,
    paystackTransferCode: transferData.data.transfer_code as string,
  }
}

/** Queue withdrawal after wallet debit. */
export async function createMoneyWalletWithdrawalRequest(args: {
  userId: string
  payoutAmount: number
  payoutCurrency: string
  bankAccountId: string
  walletTransactionId: string
  quoteMetadata: Record<string, unknown>
}) {
  const bank = await prisma.bankAccount.findUnique({ where: { id: args.bankAccountId } })
  if (!bank) throw new Error("Bank account not found")

  const settings = await getMoneyTransferPayoutSettings()
  let delayMinutes = settings.autoPayoutEnabled ? settings.autoPayoutDelayMinutes : null
  if (
    settings.autoPayoutEnabled &&
    args.payoutCurrency === "NGN" &&
    settings.withdrawalInstantMaxNgn != null &&
    args.payoutAmount <= settings.withdrawalInstantMaxNgn
  ) {
    delayMinutes = 1
  }
  const scheduledProcessAt =
    settings.autoPayoutEnabled && delayMinutes != null
      ? new Date(Date.now() + delayMinutes * 60 * 1000)
      : null

  const status: MoneyWalletWithdrawalStatus = settings.autoPayoutEnabled
    ? "SCHEDULED"
    : "PENDING"

  return prisma.moneyWalletWithdrawal.create({
    data: {
      userId: args.userId,
      walletTransactionId: args.walletTransactionId,
      bankAccountId: args.bankAccountId,
      amount: args.payoutAmount,
      currency: args.payoutCurrency,
      status,
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      accountName: bank.accountHolderName,
      bankCode: bank.routingNumber || bank.swiftCode || "",
      scheduledProcessAt,
      metadata: {
        autoPayout: settings.autoPayoutEnabled,
        delayMinutes,
        instantPath:
          delayMinutes === 1 &&
          settings.withdrawalInstantMaxNgn != null &&
          args.payoutAmount <= settings.withdrawalInstantMaxNgn,
        ...args.quoteMetadata,
      } as Prisma.InputJsonValue,
    },
  })
}

async function restoreWalletOnFailure(withdrawal: {
  id: string
  userId: string
  amount: number
  currency: string
  walletTransactionId: string
  metadata?: Prisma.JsonValue | null
}) {
  const meta =
    withdrawal.metadata && typeof withdrawal.metadata === "object"
      ? (withdrawal.metadata as Record<string, unknown>)
      : {}
  const restoreCurrency = String(
    meta.walletDebitCurrency || withdrawal.currency,
  )
    .toUpperCase()
    .slice(0, 3)
  const restoreAmount = Number(meta.walletDebitAmount ?? withdrawal.amount)
  if (!Number.isFinite(restoreAmount) || restoreAmount <= 0) return

  const wallet = await prisma.moneyTransferWallet.findUnique({
    where: { userId_currency: { userId: withdrawal.userId, currency: restoreCurrency } },
  })
  if (!wallet) return

  const newBalance = Number((wallet.balance + restoreAmount).toFixed(2))
  await prisma.$transaction([
    prisma.moneyTransferWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    }),
    prisma.moneyTransferWalletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: withdrawal.userId,
        type: "ADJUSTMENT",
        amount: restoreAmount,
        balanceAfter: newBalance,
        currency: restoreCurrency,
        description: "Withdrawal failed — balance restored",
        reference: `MTW_WD_REV_${withdrawal.id}`,
        metadata: { withdrawalId: withdrawal.id },
      },
    }),
  ])
}

/** Process one withdrawal (auto worker or admin approve). */
export async function processMoneyWalletWithdrawal(
  withdrawalId: string,
  options?: { adminId?: string; ipAddress?: string | null; userAgent?: string | null },
) {
  const withdrawal = await prisma.moneyWalletWithdrawal.findUnique({
    where: { id: withdrawalId },
  })
  if (!withdrawal) throw new Error("Withdrawal not found")

  if (!["PENDING", "SCHEDULED"].includes(withdrawal.status)) {
    throw new Error(`Cannot process withdrawal in status ${withdrawal.status}`)
  }

  if (
    withdrawal.status === "SCHEDULED" &&
    withdrawal.scheduledProcessAt &&
    withdrawal.scheduledProcessAt > new Date()
  ) {
    throw new Error("Withdrawal is not yet due for processing")
  }

  if (withdrawal.currency !== "NGN") {
    throw new Error(
      `Automated bank payout uses Paystack (NGN). This withdrawal is ${withdrawal.currency} — complete manually or add a Stripe payout rail.`,
    )
  }

  await prisma.moneyWalletWithdrawal.update({
    where: { id: withdrawalId },
    data: { status: "PROCESSING", processedAt: new Date() },
  })

  const reference =
    withdrawal.paystackReference ||
    `MTW_WD_${withdrawal.id.slice(0, 8)}_${Date.now()}`

  try {
    const paystack = await paystackSendWithdrawal({
      bankName: withdrawal.bankName,
      accountNumber: withdrawal.accountNumber,
      accountName: withdrawal.accountName,
      bankCode: withdrawal.bankCode,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      reference,
    })

    await prisma.moneyWalletWithdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: "COMPLETED",
        paystackReference: paystack.paystackReference,
        paystackTransferCode: paystack.paystackTransferCode,
        completedAt: new Date(),
        failureReason: null,
      },
    })

    await prisma.moneyTransferWalletTransaction.update({
      where: { id: withdrawal.walletTransactionId },
      data: {
        metadata: {
          withdrawalId,
          paystackReference: paystack.paystackReference,
          status: "COMPLETED",
        } as Prisma.InputJsonValue,
      },
    })

    if (options?.adminId) {
      await logMoneyTransferAdminAction({
        performedBy: options.adminId,
        action: "MONEY_WALLET_WITHDRAWAL_APPROVE",
        entityType: MONEY_TRANSFER_AUDIT_ENTITY,
        entityId: withdrawalId,
        details: { reference: paystack.paystackReference, amount: withdrawal.amount },
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      })
    }

    try {
      await NotificationBridge.sendNotification({
        userId: withdrawal.userId,
        title: "Withdrawal sent to bank",
        message: `Your ${withdrawal.currency} ${withdrawal.amount.toFixed(2)} payout was submitted to your bank. Track status in Payout tracking.`,
        type: "SYSTEM",
        module: "MONEY_TRANSFER",
        data: {
          actionType: "navigate",
          screen: "MoneyPayoutTracking",
          params: [],
        },
        actionUrl: "/money-app/payout-tracking",
      })
    } catch (e) {
      console.warn("[money-wallet-withdrawal] payout notification failed:", e)
    }

    return { success: true, paystackReference: paystack.paystackReference }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Payout failed"
    await restoreWalletOnFailure(withdrawal)
    await prisma.moneyWalletWithdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: "FAILED",
        failureReason: message,
        failedAt: new Date(),
      },
    })
    throw e
  }
}

export async function rejectMoneyWalletWithdrawal(
  withdrawalId: string,
  reason: string,
  adminId: string,
  meta?: { ipAddress?: string | null; userAgent?: string | null },
) {
  const withdrawal = await prisma.moneyWalletWithdrawal.findUnique({
    where: { id: withdrawalId },
  })
  if (!withdrawal) throw new Error("Withdrawal not found")
  if (!["PENDING", "SCHEDULED"].includes(withdrawal.status)) {
    throw new Error(`Cannot reject withdrawal in status ${withdrawal.status}`)
  }

  await restoreWalletOnFailure(withdrawal)
  await prisma.moneyWalletWithdrawal.update({
    where: { id: withdrawalId },
    data: {
      status: "REJECTED",
      failureReason: reason,
      rejectedAt: new Date(),
    },
  })

  await logMoneyTransferAdminAction({
    performedBy: adminId,
    action: "MONEY_WALLET_WITHDRAWAL_REJECT",
    entityType: MONEY_TRANSFER_AUDIT_ENTITY,
    entityId: withdrawalId,
    details: { reason },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  })
}

/** Worker tick: process due scheduled auto payouts. */
export async function processDueMoneyWalletWithdrawals(): Promise<{
  processed: number
  failed: number
}> {
  const settings = await getMoneyTransferPayoutSettings()
  if (!settings.autoPayoutEnabled) return { processed: 0, failed: 0 }

  const due = await prisma.moneyWalletWithdrawal.findMany({
    where: {
      status: "SCHEDULED",
      scheduledProcessAt: { lte: new Date() },
    },
    take: 20,
    orderBy: { scheduledProcessAt: "asc" },
  })

  let processed = 0
  let failed = 0
  for (const row of due) {
    try {
      await processMoneyWalletWithdrawal(row.id)
      processed += 1
    } catch (e) {
      failed += 1
      console.error("[money-wallet-payout]", row.id, e)
    }
  }
  return { processed, failed }
}

/**
 * Auto-approve PENDING NGN withdrawals that have waited past the smart delay,
 * when Paystack NGN balance (minus buffer) can cover the payout.
 */
export async function processSmartAutoPendingWithdrawals(): Promise<{
  processed: number
  failed: number
  skipped: number
}> {
  const cfg = await prisma.moneyTransferConfig.findFirst({
    select: {
      withdrawalSmartAutoApprove: true,
      withdrawalSmartApproveDelayMinutes: true,
      withdrawalPaystackBufferNgn: true,
    },
  })
  if (!cfg?.withdrawalSmartAutoApprove) {
    return { processed: 0, failed: 0, skipped: 0 }
  }

  const delayMin = Math.max(1, cfg.withdrawalSmartApproveDelayMinutes ?? 15)
  const cutoff = new Date(Date.now() - delayMin * 60 * 1000)
  const buffer = Math.max(0, cfg.withdrawalPaystackBufferNgn ?? 50_000)

  let paystackNgn: number | null = null
  try {
    const b = await fetchPaystackIntegrationBalances()
    paystackNgn = b.balances.find((x) => x.currency === "NGN")?.balanceMajor ?? null
  } catch {
    paystackNgn = null
  }

  const pending = await prisma.moneyWalletWithdrawal.findMany({
    where: {
      status: "PENDING",
      currency: "NGN",
      createdAt: { lte: cutoff },
    },
    take: 15,
    orderBy: { createdAt: "asc" },
  })

  let processed = 0
  let failed = 0
  let skipped = 0

  for (const row of pending) {
    if (paystackNgn != null && paystackNgn - buffer < row.amount) {
      skipped += 1
      continue
    }
    try {
      await processMoneyWalletWithdrawal(row.id)
      processed += 1
    } catch (e) {
      failed += 1
      console.error("[money-wallet-smart-auto]", row.id, e)
    }
  }

  return { processed, failed, skipped }
}

export async function submitWalletWithdrawalFromMobile(args: {
  userId: string
  amount: number
  currency: string
  bankAccountId: string
  expectedPayoutAmount?: number
}) {
  const settings = await getMoneyTransferPayoutSettings()
  if (!settings.moduleEnabled) {
    throw new Error("Money transfer module is disabled")
  }

  const bank = await prisma.bankAccount.findUnique({ where: { id: args.bankAccountId } })
  if (!bank) throw new Error("Bank account not found")

  const walletCurrency = String(args.currency).toUpperCase().slice(0, 3)
  const payoutCurrency = String(bank.currency || "NGN").toUpperCase().slice(0, 3)

  const quote = await computeWalletWithdrawalQuote({
    walletAmount: args.amount,
    walletCurrency,
    payoutCurrency,
  })

  if (args.expectedPayoutAmount != null && Number(args.expectedPayoutAmount) > 0) {
    const expected = Number(args.expectedPayoutAmount)
    const tolerance = Math.max(0.5, quote.payoutAmount * 0.02)
    if (Math.abs(quote.payoutAmount - expected) > tolerance) {
      throw new Error(
        "Exchange rate or fees changed. Please review the withdrawal details and try again.",
      )
    }
  }

  await assertWithdrawalSecurity({
    userId: args.userId,
    walletAmount: args.amount,
    walletCurrency,
    payoutAmount: quote.payoutAmount,
    payoutCurrency,
    bankAccountId: args.bankAccountId,
  })

  const reference = `MTW_WD_${Date.now()}_${args.userId.slice(0, 6)}`
  const { walletTx } = await debitMoneyTransferWalletForWithdrawal({
    userId: args.userId,
    amount: args.amount,
    currency: walletCurrency,
    description: `Withdrawal to ${bank.bankName} ••••${bank.accountNumber.slice(-4)}`,
    metadata: {
      bankAccountId: args.bankAccountId,
      reference,
      queued: true,
      payoutAmount: quote.payoutAmount,
      payoutCurrency,
    },
  })

  const withdrawal = await createMoneyWalletWithdrawalRequest({
    userId: args.userId,
    payoutAmount: quote.payoutAmount,
    payoutCurrency,
    bankAccountId: args.bankAccountId,
    walletTransactionId: walletTx.id,
    quoteMetadata: {
      walletDebitAmount: quote.walletAmount,
      walletDebitCurrency: quote.walletCurrency,
      feeInWalletCurrency: quote.feeInWalletCurrency,
      feePercentage: quote.feePercentage,
      feeFixed: quote.feeFixed,
      exchangeRate: quote.exchangeRate,
      requiresConversion: quote.requiresConversion,
    },
  })

  return { withdrawal, walletTransactionId: walletTx.id, settings, quote }
}
