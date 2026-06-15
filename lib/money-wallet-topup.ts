import { Prisma } from "@prisma/client"
import Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { getOrCreateMoneyTransferWallet } from "@/lib/money-transfer-wallet"
import {
  chargeMoneyWalletTopUpWithSavedCard,
  createMoneyWalletTopUpPaymentIntent,
  saveMoneyCardFromPaymentIntent,
} from "@/lib/money-transfer-stripe-cards"

export type TopUpGateway = "PAYSTACK" | "STRIPE"
export type TopUpPaymentMethod = "CARD" | "BANK"

async function getPrimaryGateway(): Promise<TopUpGateway> {
  const settings = await prisma.systemSettings.findFirst({ select: { paymentMethods: true } })
  const paymentMethods = (settings?.paymentMethods || {}) as Record<string, unknown>
  const primary = String(paymentMethods?.primaryGateway || paymentMethods?.primary || "STRIPE").toUpperCase()
  return primary === "PAYSTACK" ? "PAYSTACK" : "STRIPE"
}

async function getMoneyTransferStripe(): Promise<Stripe> {
  const config = await prisma.moneyTransferConfig.findFirst()
  const secret =
    config?.stripeSecretKey ||
    process.env.MONEY_TRANSFER_STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY
  if (!secret) throw new Error("Card payments are not configured")
  return new Stripe(secret, { apiVersion: "2023-10-16" })
}

async function getMoneyTransferPaystackSecret(): Promise<string> {
  const config = await prisma.moneyTransferConfig.findFirst({ select: { paystackSecretKey: true } })
  const secret =
    config?.paystackSecretKey ||
    process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET_KEY
  if (!secret) throw new Error("Paystack is not configured for money transfers")
  return secret
}

async function initializePaystack(args: {
  secretKey: string
  email: string
  amount: number
  reference: string
  metadata: Record<string, unknown>
  channels?: string[]
  callbackUrl?: string
}) {
  const body: Record<string, unknown> = {
    email: args.email,
    amount: Math.round(args.amount * 100),
    currency: "NGN",
    reference: args.reference,
    metadata: args.metadata,
  }
  if (args.channels?.length) body.channels = args.channels
  if (args.callbackUrl) body.callback_url = args.callbackUrl

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || "Failed to initialize payment")
  }
  return payload.data as { authorization_url: string; access_code: string; reference: string }
}

/** Pay with Transfer — temporary virtual account for bank deposit (NGN). */
async function createPaystackBankTransferCharge(args: {
  secretKey: string
  email: string
  amount: number
  reference: string
  metadata: Record<string, unknown>
}) {
  const response = await fetch("https://api.paystack.co/charge", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: args.email,
      amount: String(Math.round(args.amount * 100)),
      currency: "NGN",
      reference: args.reference,
      metadata: args.metadata,
      bank_transfer: {
        account_expires_at: null,
      },
    }),
  })
  const payload = await response.json()
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || "Failed to create bank transfer")
  }

  const data = payload.data as {
    reference?: string
    status?: string
    display_text?: string
    account_name?: string
    account_number?: string
    account_expires_at?: string
    bank?: { name?: string; slug?: string }
  }

  return {
    reference: data.reference || args.reference,
    status: data.status || "pending_bank_transfer",
    displayText: data.display_text,
    accountName: data.account_name,
    accountNumber: data.account_number,
    bankName: data.bank?.name,
    accountExpiresAt: data.account_expires_at,
  }
}

function normalizeCurrency(code: string): string {
  return code.trim().toUpperCase().slice(0, 3)
}

export async function createWalletTopUp(args: {
  userId: string
  email: string
  amount: number
  currency: string
  paymentMethod?: TopUpPaymentMethod
  savedPaymentMethodId?: string
  preferInlineStripe?: boolean
  saveCard?: boolean
}) {
  const amount = Number(args.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid amount")
  }

  const paymentMethod: TopUpPaymentMethod =
    args.paymentMethod === "BANK" ? "BANK" : "CARD"
  const currency = normalizeCurrency(args.currency)
  const config = await prisma.moneyTransferConfig.findFirst()
  if (!config?.isEnabled) throw new Error("Money transfers are temporarily unavailable")

  const min = config.minTransferAmount ?? 1
  const max = config.maxTransferAmount ?? 1_000_000
  if (amount < min || amount > max) {
    throw new Error(`Amount must be between ${min} and ${max}`)
  }

  const wallet = await getOrCreateMoneyTransferWallet(args.userId, currency)
  const reference = `TOPUP_${args.userId.slice(0, 8)}_${Date.now()}`
  const email = args.email || `${args.userId}@killo.local`

  const pendingTx = await prisma.moneyTransferWalletTransaction.create({
    data: {
      walletId: wallet.id,
      userId: args.userId,
      type: "ADJUSTMENT",
      amount: 0,
      balanceAfter: wallet.balance,
      currency,
      description: paymentMethod === "BANK" ? "Wallet top-up pending (bank transfer)" : "Wallet top-up pending",
      reference,
      metadata: {
        topupPending: true,
        topupAmount: amount,
        topupCurrency: currency,
        paymentMethod,
      } as Prisma.InputJsonValue,
    },
  })

  const metadata = {
    type: "WALLET_TOPUP",
    userId: args.userId,
    walletTransactionId: pendingTx.id,
    currency,
    amount,
    paymentMethod,
  }

  // ── Bank deposit: Paystack Pay-with-Transfer only (never Stripe) ──
  if (paymentMethod === "BANK") {
    const secretKey = await getMoneyTransferPaystackSecret()
    const charge = await createPaystackBankTransferCharge({
      secretKey,
      email,
      amount,
      reference,
      metadata,
    })

    await prisma.moneyTransferWalletTransaction.update({
      where: { id: pendingTx.id },
      data: {
        metadata: {
          topupPending: true,
          topupAmount: amount,
          topupCurrency: currency,
          paymentMethod: "BANK",
          gateway: "PAYSTACK",
          paystackReference: charge.reference,
          bankTransfer: {
            accountName: charge.accountName,
            accountNumber: charge.accountNumber,
            bankName: charge.bankName,
            accountExpiresAt: charge.accountExpiresAt,
            displayText: charge.displayText,
          },
        } as Prisma.InputJsonValue,
      },
    })

    return {
      walletTransactionId: pendingTx.id,
      reference: charge.reference,
      payment: {
        gateway: "PAYSTACK" as const,
        method: "BANK_TRANSFER" as const,
        reference: charge.reference,
        status: charge.status,
        bankTransfer: {
          accountName: charge.accountName,
          accountNumber: charge.accountNumber,
          bankName: charge.bankName,
          accountExpiresAt: charge.accountExpiresAt,
          displayText: charge.displayText,
          amount,
          currency: "NGN",
        },
      },
    }
  }

  // ── Card: saved card charge (Stripe) ──
  if (args.savedPaymentMethodId) {
    try {
      const charge = await chargeMoneyWalletTopUpWithSavedCard({
        userId: args.userId,
        walletTransactionId: pendingTx.id,
        reference,
        paymentMethodId: args.savedPaymentMethodId,
        amount,
        currency,
      })

      await prisma.moneyTransferWalletTransaction.update({
        where: { id: pendingTx.id },
        data: {
          metadata: {
            topupPending: true,
            topupAmount: amount,
            topupCurrency: currency,
            paymentMethod: "CARD",
            gateway: "STRIPE",
            stripePaymentIntentId: charge.paymentIntentId,
            savedPaymentMethodId: args.savedPaymentMethodId,
          } as Prisma.InputJsonValue,
        },
      })

      if ("succeeded" in charge && charge.succeeded) {
        const credited = await confirmWalletTopUp({
          userId: args.userId,
          walletTransactionId: pendingTx.id,
          gateway: "STRIPE",
          paymentIntentId: charge.paymentIntentId,
        })
        return {
          walletTransactionId: pendingTx.id,
          reference,
          completed: true,
          payment: {
            gateway: "STRIPE" as const,
            method: "SAVED_CARD" as const,
            paymentIntentId: charge.paymentIntentId,
          },
          ...credited,
        }
      }

      if ("requiresAction" in charge && charge.requiresAction) {
        return {
          walletTransactionId: pendingTx.id,
          reference,
          payment: {
            gateway: "STRIPE" as const,
            method: "SAVED_CARD" as const,
            clientSecret: charge.clientSecret,
            paymentIntentId: charge.paymentIntentId,
            requiresAction: true,
          },
        }
      }

      throw new Error("Saved card payment failed")
    } catch (e) {
      const message = e instanceof Error ? e.message : "Saved card payment failed"
      throw new Error(message)
    }
  }

  // ── Card: inline Stripe (CardField) when requested ──
  if (args.preferInlineStripe) {
    const errors: string[] = []
    try {
      const intent = await createMoneyWalletTopUpPaymentIntent({
        userId: args.userId,
        walletTransactionId: pendingTx.id,
        reference,
        amount,
        currency,
        saveCard: args.saveCard,
      })
      await prisma.moneyTransferWalletTransaction.update({
        where: { id: pendingTx.id },
        data: {
          metadata: {
            topupPending: true,
            topupAmount: amount,
            topupCurrency: currency,
            paymentMethod: "CARD",
            gateway: "STRIPE",
            stripePaymentIntentId: intent.paymentIntentId,
            saveCard: Boolean(args.saveCard),
          } as Prisma.InputJsonValue,
        },
      })
      return {
        walletTransactionId: pendingTx.id,
        reference,
        payment: {
          gateway: "STRIPE" as const,
          method: "CARD" as const,
          clientSecret: intent.clientSecret,
          paymentIntentId: intent.paymentIntentId,
        },
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Stripe unavailable")
    }

    if (config.paystackSecretKey) {
      try {
        const paystackCallback = `${process.env.NEXT_PUBLIC_APP_URL || ""}/money-transfer/return`
        const init = await initializePaystack({
          secretKey: config.paystackSecretKey,
          email,
          amount,
          reference,
          metadata,
          channels: ["card"],
          callbackUrl: paystackCallback || undefined,
        })
        await prisma.moneyTransferWalletTransaction.update({
          where: { id: pendingTx.id },
          data: {
            metadata: {
              topupPending: true,
              topupAmount: amount,
              topupCurrency: currency,
              paymentMethod: "CARD",
              gateway: "PAYSTACK",
              paystackReference: init.reference,
            } as Prisma.InputJsonValue,
          },
        })
        return {
          walletTransactionId: pendingTx.id,
          reference: init.reference,
          payment: {
            gateway: "PAYSTACK" as const,
            method: "CARD" as const,
            authorizationUrl: init.authorization_url,
            accessCode: init.access_code,
            reference: init.reference,
          },
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Paystack unavailable")
      }
    }

    throw new Error(errors.join(". ") || "Could not start card payment")
  }

  // ── Card: Paystack first (card channel), Stripe fallback ──
  const primary = await getPrimaryGateway()
  const errors: string[] = []
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/money-transfer/return`

  if (config.paystackSecretKey) {
    try {
      const init = await initializePaystack({
        secretKey: config.paystackSecretKey,
        email,
        amount,
        reference,
        metadata,
        channels: ["card"],
        callbackUrl: callbackUrl || undefined,
      })
      await prisma.moneyTransferWalletTransaction.update({
        where: { id: pendingTx.id },
        data: {
          metadata: {
            topupPending: true,
            topupAmount: amount,
            topupCurrency: currency,
            paymentMethod: "CARD",
            gateway: "PAYSTACK",
            paystackReference: init.reference,
          } as Prisma.InputJsonValue,
        },
      })
      return {
        walletTransactionId: pendingTx.id,
        reference: init.reference,
        payment: {
          gateway: "PAYSTACK" as const,
          method: "CARD" as const,
          authorizationUrl: init.authorization_url,
          accessCode: init.access_code,
          reference: init.reference,
        },
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Paystack unavailable")
      if (primary === "PAYSTACK") {
        // Primary is Paystack — still try Stripe as silent fallback
      }
    }
  } else if (primary === "PAYSTACK") {
    errors.push("Paystack secret key not configured")
  }

  try {
    const stripe = await getMoneyTransferStripe()
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      description: `Kilo wallet top-up ${reference}`,
      metadata: {
        ...metadata,
        reference,
      },
    })
    await prisma.moneyTransferWalletTransaction.update({
      where: { id: pendingTx.id },
      data: {
        metadata: {
          topupPending: true,
          topupAmount: amount,
          topupCurrency: currency,
          paymentMethod: "CARD",
          gateway: "STRIPE",
          stripePaymentIntentId: paymentIntent.id,
        } as Prisma.InputJsonValue,
      },
    })
    return {
      walletTransactionId: pendingTx.id,
      reference,
      payment: {
        gateway: "STRIPE" as const,
        method: "CARD" as const,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      },
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Card payment unavailable")
    throw new Error(errors.join(". ") || "Could not start payment")
  }
}

async function verifyPaystackPayment(secretKey: string, reference: string) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  )
  const payload = await response.json()
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || "Payment verification failed")
  }
  return payload.data as { status?: string; amount?: number; channel?: string }
}

export async function confirmWalletTopUp(args: {
  userId: string
  walletTransactionId: string
  gateway: TopUpGateway
  reference?: string
  paymentIntentId?: string
}) {
  const pending = await prisma.moneyTransferWalletTransaction.findFirst({
    where: {
      id: args.walletTransactionId,
      userId: args.userId,
      type: "ADJUSTMENT",
    },
  })
  if (!pending) throw new Error("Top-up not found")

  const meta = (pending.metadata as Record<string, unknown>) || {}
  if (!meta.topupPending) throw new Error("Top-up already processed")

  const amount = Number(meta.topupAmount)
  const currency = normalizeCurrency(String(meta.topupCurrency || pending.currency))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid top-up amount")

  let paid = false
  let pendingBankTransfer = false
  const config = await prisma.moneyTransferConfig.findFirst()

  if (args.gateway === "STRIPE") {
    const stripe = await getMoneyTransferStripe()
    const intentId =
      args.paymentIntentId || String(meta.stripePaymentIntentId || "")
    const intent = await stripe.paymentIntents.retrieve(intentId)
    paid = intent.status === "succeeded"
  } else {
    if (!config?.paystackSecretKey) throw new Error("Paystack is not configured")
    const ref = args.reference || String(meta.paystackReference || pending.reference)
    const result = await verifyPaystackPayment(config.paystackSecretKey, ref)
    if (result?.status === "success") {
      paid = true
    } else if (
      meta.paymentMethod === "BANK" ||
      result?.channel === "bank_transfer" ||
      result?.status === "pending"
    ) {
      pendingBankTransfer = true
    }
  }

  if (pendingBankTransfer && !paid) {
    return {
      success: true,
      pending: true,
      message: "Waiting for your bank transfer. Your wallet will update once payment clears.",
      amount,
      currency,
    }
  }

  if (!paid) throw new Error("Payment was not completed")

  const existingCredit = await prisma.moneyTransferWalletTransaction.findFirst({
    where: {
      reference: `${pending.reference}_CREDIT`,
      type: "CREDIT",
    },
  })
  if (existingCredit) {
    return { success: true, alreadyCredited: true, amount, currency }
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.moneyTransferWallet.findUnique({
      where: { id: pending.walletId },
    })
    if (!wallet) throw new Error("Wallet not found")

    const newBalance = roundMoney(wallet.balance + amount)
    await tx.moneyTransferWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    await tx.moneyTransferWalletTransaction.update({
      where: { id: pending.id },
      data: {
        metadata: {
          ...meta,
          topupPending: false,
          topupCompletedAt: new Date().toISOString(),
          gateway: args.gateway,
        } as Prisma.InputJsonValue,
      },
    })

    await tx.moneyTransferWalletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: args.userId,
        type: "CREDIT",
        amount,
        balanceAfter: newBalance,
        currency,
        description: "Wallet top-up",
        reference: `${pending.reference}_CREDIT`,
        metadata: {
          topup: true,
          gateway: args.gateway,
          pendingTransactionId: pending.id,
        } as Prisma.InputJsonValue,
      },
    })

    return { success: true, amount, currency, balance: newBalance }
  }).then(async (result) => {
    if (meta.saveCard && args.gateway === "STRIPE") {
      const intentId = args.paymentIntentId || String(meta.stripePaymentIntentId || "")
      if (intentId) {
        try {
          await saveMoneyCardFromPaymentIntent(args.userId, intentId)
        } catch {
          /* card save is best-effort */
        }
      }
    }
    return result
  })
}

/** Called from Paystack webhook on charge.success for async bank transfers. */
export async function completeWalletTopUpFromPaystackReference(reference: string) {
  const pending = await prisma.moneyTransferWalletTransaction.findFirst({
    where: {
      reference,
      type: "ADJUSTMENT",
    },
  })
  if (!pending) return { skipped: true, reason: "not_found" }

  const meta = (pending.metadata as Record<string, unknown>) || {}
  if (!meta.topupPending) return { skipped: true, reason: "already_processed" }

  return confirmWalletTopUp({
    userId: pending.userId,
    walletTransactionId: pending.id,
    gateway: "PAYSTACK",
    reference,
  })
}

function roundMoney(value: number): number {
  return Number(Number(value).toFixed(2))
}

export type PendingBankTopUpRow = {
  walletTransactionId: string
  reference: string
  amount: number
  currency: string
  createdAt: string
  gateway: "PAYSTACK"
  isExpired: boolean
  bankTransfer: {
    accountName?: string
    accountNumber?: string
    bankName?: string
    accountExpiresAt?: string
    displayText?: string
  }
}

function mapPendingBankTopUpRow(row: {
  id: string
  reference: string
  currency: string
  createdAt: Date
  metadata: unknown
}): PendingBankTopUpRow | null {
  const meta = (row.metadata as Record<string, unknown>) || {}
  if (!meta.topupPending || meta.paymentMethod !== "BANK") return null

  const bt = (meta.bankTransfer as Record<string, unknown>) || {}
  const expiresAt = bt.accountExpiresAt ? String(bt.accountExpiresAt) : undefined
  const isExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false

  return {
    walletTransactionId: row.id,
    reference: String(meta.paystackReference || row.reference),
    amount: Number(meta.topupAmount) || 0,
    currency: normalizeCurrency(String(meta.topupCurrency || row.currency)),
    createdAt: row.createdAt.toISOString(),
    gateway: "PAYSTACK",
    isExpired,
    bankTransfer: {
      accountName: bt.accountName ? String(bt.accountName) : undefined,
      accountNumber: bt.accountNumber ? String(bt.accountNumber) : undefined,
      bankName: bt.bankName ? String(bt.bankName) : undefined,
      accountExpiresAt: expiresAt,
      displayText: bt.displayText ? String(bt.displayText) : undefined,
    },
  }
}

/** Pending Paystack bank transfers saved in wallet transaction metadata. */
export async function listPendingBankTopUps(userId: string, limit = 10) {
  const rows = await prisma.moneyTransferWalletTransaction.findMany({
    where: {
      userId,
      type: "ADJUSTMENT",
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 30),
  })

  return rows
    .map(mapPendingBankTopUpRow)
    .filter((r): r is PendingBankTopUpRow => r != null && r.amount > 0)
}

export async function getPendingBankTopUp(userId: string, walletTransactionId: string) {
  const row = await prisma.moneyTransferWalletTransaction.findFirst({
    where: {
      id: walletTransactionId,
      userId,
      type: "ADJUSTMENT",
    },
  })
  if (!row) return null
  return mapPendingBankTopUpRow(row)
}
