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
}

/**
 * Create a wallet transaction
 * If status is COMPLETED, also update the wallet balance
 */
export async function createWalletTransaction(
  params: CreateWalletTransactionParams
): Promise<any> {
  const status = params.status || 'PENDING'

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
 * Complete wallet transactions when trip is completed
 */
export async function completeOrderWalletTransactions(orderId: string): Promise<void> {
  const transactions = await prisma.walletTransaction.findMany({
    where: {
      orderId,
      status: 'PENDING',
    },
  })

  for (const transaction of transactions) {
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

  const hasVendor =
    pending.some((t) => txMetaType(t.metadata) === "ORDER_PAYMENT") ||
    Boolean(vendorPrepaidAtCheckout)
  const hasRider = pending.some((t) => txMetaType(t.metadata) === "DELIVERY_PAYMENT")

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
      },
    })
  }

  if (!hasRider && params.riderAmount > 0) {
    await createWalletTransaction({
      userId: params.riderId,
      type: "CREDIT",
      amount: params.riderAmount,
      description: params.description || `Delivery payment for order ${params.orderId}`,
      orderId: params.orderId,
      status: "PENDING",
      metadata: {
        courierBookingId: params.courierBookingId,
        transactionType: "DELIVERY_PAYMENT",
      },
    })
  }
}

/** Courier completed with no marketplace order — pay rider delivery fare only. */
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
  if (existing) return

  await createWalletTransaction({
    userId: params.riderId,
    type: "CREDIT",
    amount: params.amount,
    description: `Delivery payment for booking ${params.courierBookingId}`,
    status: "COMPLETED",
    reference: ref,
    metadata: {
      courierBookingId: params.courierBookingId,
      transactionType: "DELIVERY_PAYMENT",
    },
  })
}
