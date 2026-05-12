import { prisma } from '@/lib/prisma'
import type { WalletTransactionType, WalletTransactionStatus } from '@prisma/client'

async function getDefaultWalletCurrencyCode(): Promise<string> {
  const row = await prisma.currency.findFirst({
    where: { isDefault: true },
    select: { code: true },
  })
  return row?.code || 'NGN'
}

export interface CreateWalletTransactionParams {
  userId: string
  type: WalletTransactionType
  amount: number
  description: string
  orderId?: string
  status?: WalletTransactionStatus
  reference?: string
  metadata?: any
  /** When set with PENDING status, CREDIT is held until this time (rider payout clearance). */
  clearsAt?: Date | null
}

/**
 * Create a wallet transaction
 * If status is COMPLETED, also update the wallet balance
 */
export async function createWalletTransaction(
  params: CreateWalletTransactionParams
): Promise<any> {
  const status = params.status || 'PENDING'

  const meta = params.metadata as { transactionType?: string } | undefined
  let clearsAtForRow: Date | null | undefined = params.clearsAt
  if (
    clearsAtForRow == null &&
    status === 'PENDING' &&
    (params.type === 'CREDIT' || params.type === 'BONUS') &&
    meta?.transactionType === 'EARNING_PAYOUT'
  ) {
    const { getRiderWalletClearanceDays, computeWalletClearsAt } = await import(
      '@/lib/rider-wallet-clearance-settings'
    )
    const days = await getRiderWalletClearanceDays()
    clearsAtForRow = computeWalletClearsAt(days)
  }

  // Get or create wallet for user
  let wallet = await prisma.wallet.findUnique({
    where: { userId: params.userId },
  })

  if (!wallet) {
    const currency = await getDefaultWalletCurrencyCode()
    wallet = await prisma.wallet.create({
      data: {
        userId: params.userId,
        balance: 0,
        currency,
      },
    })
  }

  // Calculate new balance if status is COMPLETED
  let newBalance = wallet.balance
  if (status === 'COMPLETED') {
    if (params.type === 'CREDIT' || params.type === 'DEPOSIT' || params.type === 'BONUS' || params.type === 'CASHBACK') {
      newBalance = wallet.balance + params.amount
    } else if (params.type === 'DEBIT' || params.type === 'WITHDRAWAL') {
      newBalance = wallet.balance - params.amount
    }
  }

  // Create transaction
  const transaction = await prisma.walletTransaction.create({
    data: {
      userId: params.userId,
      type: params.type,
      amount: params.amount,
      balance: newBalance,
      description: params.description,
      reference: params.reference,
      orderId: params.orderId,
      status,
      clearsAt: clearsAtForRow ?? null,
      metadata: params.metadata,
    },
  })

  // Update wallet balance if status is COMPLETED
  if (status === 'COMPLETED') {
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })
  }

  return transaction
}

/**
 * Complete a pending wallet transaction
 * Updates status to COMPLETED and adds amount to wallet balance
 */
export async function completeWalletTransaction(transactionId: string): Promise<void> {
  const transaction = await prisma.walletTransaction.findUnique({
    where: { id: transactionId },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  if (transaction.status === 'COMPLETED') {
    return // Already completed
  }

  let wallet = await prisma.wallet.findUnique({
    where: { userId: transaction.userId },
  })

  if (!wallet) {
    const currency = await getDefaultWalletCurrencyCode()
    wallet = await prisma.wallet.create({
      data: {
        userId: transaction.userId,
        balance: 0,
        currency,
      },
    })
  }

  // Calculate new balance
  let newBalance = wallet.balance
  if (transaction.type === 'CREDIT' || transaction.type === 'DEPOSIT' || transaction.type === 'BONUS' || transaction.type === 'CASHBACK') {
    newBalance = wallet.balance + transaction.amount
  } else if (transaction.type === 'DEBIT' || transaction.type === 'WITHDRAWAL') {
    newBalance = wallet.balance - transaction.amount
  }

  // Update transaction and wallet in a transaction
  await prisma.$transaction([
    prisma.walletTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'COMPLETED',
        balance: newBalance,
        clearsAt: null,
      },
    }),
    prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    }),
  ])
}

/**
 * Create wallet transactions for vendor and rider on order completion.
 * `vendorAmount` should be merchandise net minus VENDOR_COMMISSION (not customer platform fee).
 */
export async function createOrderCompletionWalletTransactions(params: {
  vendorId: string
  vendorAmount: number
  riderId?: string
  riderAmount?: number
  orderId: string
  courierBookingId?: string
  description?: string
}): Promise<{
  vendorTransaction: any
  riderTransaction: any | null
}> {
  // Create vendor wallet transaction (pending)
  const vendorTransaction = await createWalletTransaction({
    userId: params.vendorId,
    type: 'CREDIT',
    amount: params.vendorAmount,
    description: params.description || `Payment for order ${params.orderId}`,
    orderId: params.orderId,
    status: 'PENDING',
    metadata: {
      courierBookingId: params.courierBookingId,
      transactionType: 'ORDER_PAYMENT',
    },
  })

  // Create rider wallet transaction (pending) if rider exists
  let riderTransaction = null
  if (params.riderId && params.riderAmount) {
    riderTransaction = await createWalletTransaction({
      userId: params.riderId,
      type: 'CREDIT',
      amount: params.riderAmount,
      description: params.description || `Delivery payment for order ${params.orderId}`,
      orderId: params.orderId,
      status: 'PENDING',
      metadata: {
        courierBookingId: params.courierBookingId,
        transactionType: 'DELIVERY_PAYMENT',
      },
    })
  }

  return {
    vendorTransaction,
    riderTransaction,
  }
}

/**
 * Complete wallet transactions when order completion runs.
 * @param skipMetaTypes — e.g. `["DELIVERY_PAYMENT"]` to leave rider credits pending for clearance worker (ride-like courier).
 */
export async function completeOrderWalletTransactions(
  orderId: string,
  options?: { skipMetaTypes?: string[] }
): Promise<void> {
  const skip = new Set(
    (options?.skipMetaTypes || []).map((t) => String(t).trim().toUpperCase()).filter(Boolean)
  )
  const transactions = await prisma.walletTransaction.findMany({
    where: {
      orderId,
      status: 'PENDING',
    },
  })

  for (const transaction of transactions) {
    const typ = String(txMetaType(transaction.metadata) || "").toUpperCase()
    if (typ && skip.has(typ)) continue
    await completeWalletTransaction(transaction.id)
  }
}

function txMetaType(metadata: unknown): string | undefined {
  if (metadata && typeof metadata === "object" && "transactionType" in metadata) {
    return String((metadata as { transactionType?: string }).transactionType || "")
  }
  return undefined
}

/**
 * Ensures PENDING vendor + rider wallet rows exist before completion (checkout may only create vendor, or neither for pharmacy).
 * Then callers should run completeOrderWalletTransactions(orderId).
 */
export async function ensureOrderCompletionPendingWallets(params: {
  orderId: string
  vendorId: string | null
  riderId: string
  riderAmount: number
  vendorAmount: number
  courierBookingId?: string
  description?: string
  /** Merged into vendor ORDER_PAYMENT wallet row metadata (e.g. special-offer funding). */
  vendorMetadata?: Record<string, unknown>
  /**
   * When true, rider `DELIVERY_PAYMENT` CREDIT is created with `clearsAt` (rider wallet clearance).
   * Caller should run `completeOrderWalletTransactions(orderId, { skipMetaTypes: ["DELIVERY_PAYMENT"] })`
   * so the rider line stays PENDING until the worker completes it.
   */
  deferRiderCreditClearance?: boolean
}): Promise<void> {
  const pending = await prisma.walletTransaction.findMany({
    where: { orderId: params.orderId, status: "PENDING" },
  })

  const vendorPrepaidAtCheckout = await prisma.walletTransaction.findFirst({
    where: {
      orderId: params.orderId,
      reference: `VENDOR-EARN-${params.orderId}`,
      status: "COMPLETED",
    },
  })

  const effectiveVendorAmount = vendorPrepaidAtCheckout ? 0 : params.vendorAmount

  const vendorPendingTx = pending.find((t) => txMetaType(t.metadata) === "ORDER_PAYMENT")
  const hasVendor = Boolean(vendorPendingTx) || Boolean(vendorPrepaidAtCheckout)
  const hasRider = pending.some((t) => txMetaType(t.metadata) === "DELIVERY_PAYMENT")

  /** Checkout may create ORDER_PAYMENT using customer subtotal; pharmacy settlement corrects amount at completion. */
  if (
    vendorPendingTx &&
    !vendorPrepaidAtCheckout &&
    params.vendorId &&
    vendorPendingTx.userId === params.vendorId &&
    effectiveVendorAmount > 0
  ) {
    const diff = Math.abs(Number(vendorPendingTx.amount) - effectiveVendorAmount)
    if (diff > 0.009) {
      const prevMeta =
        vendorPendingTx.metadata && typeof vendorPendingTx.metadata === "object"
          ? (vendorPendingTx.metadata as Record<string, unknown>)
          : {}
      await prisma.walletTransaction.update({
        where: { id: vendorPendingTx.id },
        data: {
          amount: effectiveVendorAmount,
          metadata: {
            ...prevMeta,
            transactionType: "ORDER_PAYMENT",
            ...(params.vendorMetadata && typeof params.vendorMetadata === "object" ? params.vendorMetadata : {}),
            ...(params.courierBookingId ? { courierBookingId: params.courierBookingId } : {}),
          },
        },
      })
    }
  }

  if (!hasVendor && params.vendorId && effectiveVendorAmount > 0) {
    await createWalletTransaction({
      userId: params.vendorId,
      type: "CREDIT",
      amount: effectiveVendorAmount,
      description: params.description || `Payment for order ${params.orderId}`,
      orderId: params.orderId,
      status: "PENDING",
      metadata: {
        courierBookingId: params.courierBookingId,
        transactionType: "ORDER_PAYMENT",
        ...(params.vendorMetadata && typeof params.vendorMetadata === "object" ? params.vendorMetadata : {}),
      },
    })
  }

  if (!hasRider && params.riderAmount > 0) {
    let riderClearsAt: Date | null | undefined = undefined
    if (params.deferRiderCreditClearance) {
      const { getRiderWalletClearanceDays, computeWalletClearsAt } = await import(
        '@/lib/rider-wallet-clearance-settings'
      )
      const days = await getRiderWalletClearanceDays()
      riderClearsAt = computeWalletClearsAt(days)
    }
    await createWalletTransaction({
      userId: params.riderId,
      type: "CREDIT",
      amount: params.riderAmount,
      description: params.description || `Delivery payment for order ${params.orderId}`,
      orderId: params.orderId,
      status: "PENDING",
      clearsAt: riderClearsAt ?? null,
      metadata: {
        courierBookingId: params.courierBookingId,
        transactionType: "DELIVERY_PAYMENT",
      },
    })
  }
}

/** Courier completed with no marketplace order — pay rider delivery fare (held until clearance). */
export async function ensureRiderDeliveryWalletCompleted(params: {
  riderId: string
  amount: number
  courierBookingId: string
}): Promise<void> {
  if (params.amount <= 0) return

  const ref = `courier:${params.courierBookingId}:delivery`
  const existing = await prisma.walletTransaction.findFirst({
    where: {
      userId: params.riderId,
      reference: ref,
    },
  })
  if (existing?.status === "COMPLETED") return
  if (existing?.status === "PENDING") return

  const { getRiderWalletClearanceDays, computeWalletClearsAt } = await import(
    "@/lib/rider-wallet-clearance-settings"
  )
  const days = await getRiderWalletClearanceDays()

  await createWalletTransaction({
    userId: params.riderId,
    type: "CREDIT",
    amount: params.amount,
    description: `Delivery payment for booking ${params.courierBookingId} (clears in ${days} day${days === 1 ? "" : "s"})`,
    status: "PENDING",
    reference: ref,
    clearsAt: computeWalletClearsAt(days),
    metadata: {
      courierBookingId: params.courierBookingId,
      transactionType: "DELIVERY_PAYMENT",
    },
  })
}
