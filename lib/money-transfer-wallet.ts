import { MoneyTransferSettlementMode, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { assertPlausibleConversion, getMoneyTransferFxRate } from "@/lib/money-fx-rate"
import { NotificationBridge } from "@/lib/notification-bridge"
import { sendEmail, sendEmailFromTemplate } from "@/lib/email"

/** Must match `EmailTemplate.templateKey` in admin (module: MONEY_TRANSFER). */
export const WALLET_CREDIT_EMAIL_TEMPLATE_KEY =
  process.env.MONEY_WALLET_CREDIT_EMAIL_TEMPLATE_KEY || "MONEY_WALLET_CREDIT"

export function parseTransferSettlementMode(
  value: unknown,
  fallback: MoneyTransferSettlementMode = MoneyTransferSettlementMode.WALLET,
): MoneyTransferSettlementMode {
  if (value === "DIRECT_BANK" || value === MoneyTransferSettlementMode.DIRECT_BANK) {
    return MoneyTransferSettlementMode.DIRECT_BANK
  }
  if (value === "WALLET" || value === MoneyTransferSettlementMode.WALLET) {
    return MoneyTransferSettlementMode.WALLET
  }
  return fallback
}

export async function getDefaultSettlementMode(): Promise<MoneyTransferSettlementMode> {
  const config = await prisma.moneyTransferConfig.findFirst({
    select: { settlementMode: true },
  })
  return config?.settlementMode ?? MoneyTransferSettlementMode.WALLET
}

/** @deprecated Use getDefaultSettlementMode — kept for imports */
export const getMoneyTransferSettlementMode = getDefaultSettlementMode

export const DEFAULT_WALLET_CURRENCY = "NGN"

function normalizeCurrency(code: unknown): string {
  if (typeof code === "string" && code.trim()) {
    return code.trim().toUpperCase().slice(0, 3)
  }
  if (code && typeof code === "object" && "code" in code) {
    const nested = (code as { code?: unknown }).code
    if (typeof nested === "string" && nested.trim()) {
      return nested.trim().toUpperCase().slice(0, 3)
    }
  }
  return DEFAULT_WALLET_CURRENCY
}

/** Primary currency first (from system settings), then alphabetical. */
export function sortMoneyTransferWallets<T extends { currency: string }>(
  wallets: T[],
  primaryCurrency = DEFAULT_WALLET_CURRENCY,
): T[] {
  const primary = normalizeCurrency(primaryCurrency)
  return [...wallets].sort((a, b) => {
    const ac = normalizeCurrency(a.currency)
    const bc = normalizeCurrency(b.currency)
    if (ac === primary) return -1
    if (bc === primary) return 1
    return ac.localeCompare(bc)
  })
}

export async function getSystemDefaultCurrency(): Promise<string> {
  const [settings, defaultRow] = await Promise.all([
    prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { currency: true },
    }),
    prisma.currency.findFirst({
      where: { isDefault: true },
      select: { code: true },
    }),
  ])
  if (typeof settings?.currency === "string" && settings.currency.trim()) {
    return normalizeCurrency(settings.currency)
  }
  if (defaultRow?.code) {
    return normalizeCurrency(defaultRow.code)
  }
  return DEFAULT_WALLET_CURRENCY
}

export async function getOrCreateMoneyTransferWallet(userId: string, currency = "NGN") {
  const c = normalizeCurrency(currency)
  const existing = await prisma.moneyTransferWallet.findUnique({
    where: { userId_currency: { userId, currency: c } },
  })
  if (existing) return existing
  return prisma.moneyTransferWallet.create({
    data: { userId, currency: c, balance: 0 },
  })
}

export async function listMoneyTransferWallets(userId: string) {
  return prisma.moneyTransferWallet.findMany({
    where: { userId, isActive: true },
    orderBy: { currency: "asc" },
  })
}

function roundMoneyAmount(value: number): number {
  return Number(Number(value).toFixed(2))
}

/**
 * Wallet credits MUST use the receive amount locked at transfer creation.
 * Never recompute FX at settlement time (prevents wrong rates / inverted pairs).
 */
async function resolveSettlementAmount(transfer: {
  id: string
  amount: number
  currency: string
  receiveAmount: number | null
  receiveCurrency: string | null
}): Promise<{ amount: number; currency: string }> {
  const settlementCurrency = normalizeCurrency(transfer.receiveCurrency || transfer.currency)
  const sendCurrency = normalizeCurrency(transfer.currency)

  if (sendCurrency === settlementCurrency) {
    return { amount: roundMoneyAmount(transfer.amount), currency: settlementCurrency }
  }

  if (transfer.receiveAmount == null || transfer.receiveAmount <= 0) {
    throw new Error(
      `Transfer ${transfer.id} has no locked receive amount; refusing wallet credit`,
    )
  }

  assertPlausibleConversion(
    transfer.amount,
    sendCurrency,
    transfer.receiveAmount,
    settlementCurrency,
  )

  return {
    amount: roundMoneyAmount(transfer.receiveAmount),
    currency: settlementCurrency,
  }
}

async function sendWalletCreditEmail(args: {
  to: string
  receiverName: string
  senderLabel: string
  amount: number
  currency: string
  sendAmount: number
  sendCurrency: string
  reference: string
}) {
  if (!to?.includes("@")) return

  const settings = await prisma.systemSettings.findFirst({
    select: { compnyinfo: true },
  })
  const adminContact =
    (settings?.compnyinfo as { supportCenter?: { email?: string } })?.supportCenter?.email ||
    process.env.SUPPORT_EMAIL ||
    "support@killo.app"

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://killo.app"
  const actionUrl = `${appUrl}/money-app/home`

  const templateData = {
    receiverName: args.receiverName,
    senderLabel: args.senderLabel,
    currency: args.currency,
    amount: args.amount.toFixed(2),
    sendCurrency: args.sendCurrency,
    sendAmount: args.sendAmount.toFixed(2),
    reference: args.reference,
    actionUrl,
    adminContact,
    year: String(new Date().getFullYear()),
  }

  try {
    await sendEmailFromTemplate(
      args.to,
      'GENERICNOTIFICATION',
      templateData,
      "GLOBAL",
      "PAYMENT"
    )
  } catch (e) {
    console.error("Wallet credit email (template) failed:", e)
    try {
      await sendEmail(args.to, "genericNotification", {
        title: "Money received in your Kilo wallet",
        message: `Hi ${args.receiverName},<br/><br/>
          <strong>${args.senderLabel}</strong> sent you <strong>${args.currency} ${templateData.amount}</strong>
          (from ${args.sendCurrency} ${templateData.sendAmount}).<br/><br/>
          Reference: <code>${args.reference}</code><br/>
          The funds are in your Kilo wallet.`,
        actionUrl,
        actionText: "View wallet",
        adminContact,
      })
    } catch (fallbackErr) {
      console.error("Wallet credit email fallback failed:", fallbackErr)
    }
  }
}

/** Idempotent credit for a completed inbound transfer. */
export async function creditMoneyTransferWalletFromTransfer(transferId: string) {
  const existing = await prisma.moneyTransferWalletTransaction.findFirst({
    where: { transferId, type: "CREDIT" },
  })
  if (existing) {
    return { credited: false, alreadyCredited: true, transaction: existing }
  }

  const transfer = await prisma.moneyTransfer.findUnique({
    where: { id: transferId },
    include: {
      sender: { select: { id: true, name: true, email: true, phone: true } },
      receiver: { select: { id: true, name: true, email: true, phone: true } },
    },
  })

  if (!transfer) {
    throw new Error(`Transfer not found: ${transferId}`)
  }

  const { amount, currency } = await resolveSettlementAmount(transfer)
  if (amount <= 0) {
    throw new Error("Invalid settlement amount for wallet credit")
  }

  const senderLabel =
    transfer.sender.name || transfer.sender.email || transfer.sender.phone || "Someone"
  const receiverName =
    transfer.receiver.name || transfer.receiver.email || transfer.receiver.phone || "there"

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateMoneyTransferWalletTx(tx, transfer.receiverId, currency)
    const newBalance = wallet.balance + amount

    const walletTx = await tx.moneyTransferWalletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: transfer.receiverId,
        type: "CREDIT",
        amount,
        balanceAfter: newBalance,
        currency,
        description: `Received from ${senderLabel}`,
        reference: `MTW_CREDIT_${transfer.id}`,
        transferId: transfer.id,
        metadata: {
          sendAmount: transfer.amount,
          sendCurrency: transfer.currency,
        } as Prisma.InputJsonValue,
      },
    })

    await tx.moneyTransferWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    await tx.moneyTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        receiveAmount: amount,
        receiveCurrency: currency,
        metadata: {
          ...(transfer.metadata as object),
          walletCredited: true,
          walletTransactionId: walletTx.id,
        } as Prisma.InputJsonValue,
      },
    })

    return { wallet, walletTx, newBalance }
  })

  try {
    await NotificationBridge.sendNotification({
      userId: transfer.receiverId,
      title: "Money in your Kilo Wallet",
      message: `You received ${currency} ${amount.toFixed(2)} from ${senderLabel}. Withdraw to your bank anytime.`,
      type: "SYSTEM",
      module: "MONEY_TRANSFER",
      data: {
        actionType: "navigate",
        screen: "MoneyWalletHistory",
        params: [],
      },
      actionUrl: "/money-app/wallet/history",
    })

    if (transfer.receiver.email) {
      await sendWalletCreditEmail({
        to: transfer.receiver.email,
        receiverName,
        senderLabel,
        amount,
        currency,
        sendAmount: transfer.amount,
        sendCurrency: transfer.currency,
        reference: transfer.reference,
      })
    }
  } catch (e) {
    console.error("Wallet credit notification/email failed (funds already credited):", e)
  }

  return { credited: true, alreadyCredited: false, ...result }
}

async function getOrCreateMoneyTransferWalletTx(
  tx: Prisma.TransactionClient,
  userId: string,
  currency: string,
) {
  const c = normalizeCurrency(currency)
  const existing = await tx.moneyTransferWallet.findUnique({
    where: { userId_currency: { userId, currency: c } },
  })
  if (existing) return existing
  return tx.moneyTransferWallet.create({
    data: { userId, currency: c, balance: 0 },
  })
}

export async function debitMoneyTransferWalletForWithdrawal(args: {
  userId: string
  amount: number
  currency: string
  description: string
  payoutId?: string
  metadata?: Record<string, unknown>
}) {
  if (args.amount <= 0) throw new Error("Withdrawal amount must be positive")
  const c = normalizeCurrency(args.currency)

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.moneyTransferWallet.findUnique({
      where: { userId_currency: { userId: args.userId, currency: c } },
    })
    if (!wallet) {
      throw new Error(`No ${c} wallet found`)
    }
    if (wallet.balance < args.amount) {
      throw new Error("Insufficient wallet balance")
    }

    const newBalance = wallet.balance - args.amount
    const walletTx = await tx.moneyTransferWalletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: args.userId,
        type: "WITHDRAWAL",
        amount: args.amount,
        balanceAfter: newBalance,
        currency: c,
        description: args.description,
        reference: `MTW_WD_${Date.now()}_${args.userId.slice(0, 6)}`,
        payoutId: args.payoutId,
        metadata: (args.metadata ?? {}) as Prisma.InputJsonValue,
      },
    })

    await tx.moneyTransferWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    return { wallet, walletTx, newBalance }
  })
}

type WalletDebitPlan = {
  walletId: string
  currency: string
  debitAmount: number
  equivalentInTarget: number
}

/**
 * Debit across all active wallets, converting foreign balances into the target currency.
 * Same-currency wallets are used first; FX uses admin margin rates at debit time.
 */
export async function debitMoneyTransferWalletComposite(args: {
  userId: string
  amountNeeded: number
  targetCurrency: string
  transferId: string
  description: string
  referencePrefix: string
}) {
  const targetCurrency = normalizeCurrency(args.targetCurrency)
  let remaining = roundMoneyAmount(args.amountNeeded)
  if (remaining <= 0) throw new Error("Invalid debit amount")

  const wallets = (await listMoneyTransferWallets(args.userId)).filter((w) => w.balance > 0)
  if (!wallets.length) {
    throw new Error(`Insufficient wallet balance. Need ${targetCurrency} ${remaining.toFixed(2)}`)
  }

  const plans: WalletDebitPlan[] = []
  const entries: Array<{ wallet: (typeof wallets)[0]; valueInTarget: number; rate: number }> = []
  let totalAvailable = 0

  for (const wallet of wallets) {
    const curr = normalizeCurrency(wallet.currency)
    if (curr === targetCurrency) {
      entries.push({ wallet, valueInTarget: wallet.balance, rate: 1 })
      totalAvailable += wallet.balance
    } else {
      const rate = await getMoneyTransferFxRate(curr, targetCurrency)
      if (!rate || rate <= 0) continue
      const valueInTarget = roundMoneyAmount(wallet.balance * rate)
      entries.push({ wallet, valueInTarget, rate })
      totalAvailable += valueInTarget
    }
  }

  if (totalAvailable + 0.01 < remaining) {
    throw new Error(
      `Insufficient wallet balance. Need ${targetCurrency} ${remaining.toFixed(2)} (available ~${totalAvailable.toFixed(2)})`,
    )
  }

  entries.sort((a, b) => {
    const aSame = normalizeCurrency(a.wallet.currency) === targetCurrency ? 0 : 1
    const bSame = normalizeCurrency(b.wallet.currency) === targetCurrency ? 0 : 1
    if (aSame !== bSame) return aSame - bSame
    return b.valueInTarget - a.valueInTarget
  })

  for (const entry of entries) {
    if (remaining <= 0.001) break
    const curr = normalizeCurrency(entry.wallet.currency)
    let debitAmount: number
    let equivalentInTarget: number

    if (curr === targetCurrency) {
      debitAmount = Math.min(entry.wallet.balance, remaining)
      equivalentInTarget = debitAmount
    } else {
      const neededInSource = remaining / entry.rate
      debitAmount = roundMoneyAmount(Math.min(entry.wallet.balance, neededInSource))
      equivalentInTarget = roundMoneyAmount(debitAmount * entry.rate)
    }

    if (debitAmount <= 0) continue

    plans.push({
      walletId: entry.wallet.id,
      currency: curr,
      debitAmount,
      equivalentInTarget,
    })
    remaining = roundMoneyAmount(Math.max(0, remaining - equivalentInTarget))
  }

  if (remaining > 0.05) {
    throw new Error(`Could not cover debit in ${targetCurrency}. Short by ${remaining.toFixed(2)}`)
  }

  return prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      const wallet = await tx.moneyTransferWallet.findUnique({ where: { id: plan.walletId } })
      if (!wallet || wallet.balance < plan.debitAmount) {
        throw new Error(`Insufficient ${plan.currency} balance during composite debit`)
      }
      const newBalance = roundMoneyAmount(wallet.balance - plan.debitAmount)
      await tx.moneyTransferWallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      })
      await tx.moneyTransferWalletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: args.userId,
          type: "DEBIT",
          amount: plan.debitAmount,
          balanceAfter: newBalance,
          currency: plan.currency,
          description: args.description,
          reference: `${args.referencePrefix}_${plan.currency}_${args.transferId.slice(0, 8)}`,
          transferId: args.transferId,
          metadata: {
            paymentSource: "WALLET",
            compositeDebit: true,
            targetCurrency,
            equivalentInTarget: plan.equivalentInTarget,
          } as Prisma.InputJsonValue,
        },
      })
    }
  })
}
