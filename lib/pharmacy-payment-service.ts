import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { CommissionType, type Module } from "@prisma/client"
import { calculateCommission } from "@/lib/commission-service"
import { completeWalletTransaction, createWalletTransaction } from "@/lib/wallet-transaction-service"

export interface ProcessPharmacyPaymentParams {
  /**
   * Transaction client (from prisma.$transaction)
   */
  tx: Prisma.TransactionClient
  
  /**
   * Payment data from payment gateway
   */
  paymentData: {
    status: string
    id?: string
    transactionId?: string
    gateway?: string
    currency?: string
    [key: string]: any
  }
  
  /**
   * Order details
   */
  orderId: string
  orderNumber?: string
  customerId: string
  
  /**
   * Vendor payment details (wholesaler)
   */
  vendorId: string
  vendorEarnings: number // Amount vendor receives after commissions
  
  /**
   * Commission details
   */
  commissions?: {
    vendorCommission?: number
    vendorCommissionRate?: number
    platformCommission?: number
    platformCommissionRate?: number
  }
  
  /**
   * Module and metadata
   */
  module: 'PHARMACY' | 'WHOLESALER'
  metadata?: any
}

export interface ProcessPharmacyPaymentResult {
  wallet: any
  walletTransaction: any
  payment: any
}

/**
 * Process payment for pharmacy/wholesaler orders
 * - Creates/updates wallet
 * - Creates wallet transaction
 * - Creates payment record
 * - Sets payment status to PAID
 * 
 * Note: All wallet transactions are PENDING until rider completes delivery
 */
export async function processPharmacyPayment(
  params: ProcessPharmacyPaymentParams
): Promise<ProcessPharmacyPaymentResult> {
  const { tx, paymentData, orderId, orderNumber, customerId, vendorId, vendorEarnings, commissions, module, metadata } = params

  // Only process if payment succeeded
  if (paymentData.status !== 'PAID') {
    throw new Error('Payment not succeeded. Cannot process wallet transaction.')
  }

  // Get or create vendor wallet
  let vendorWallet = await tx.wallet.findUnique({
    where: { userId: vendorId }
  })

  if (!vendorWallet) {
    vendorWallet = await tx.wallet.create({
      data: {
        userId: vendorId,
        balance: 0,
        currency: paymentData.currency || 'NGN'
      }
    })
  }

  // Create PENDING wallet transaction (will be completed when rider marks order as delivered)
  // Note: Balance is NOT incremented yet - it stays at current balance
  const walletTransaction = await tx.walletTransaction.create({
    data: {
      userId: vendorId,
      type: 'CREDIT',
      amount: vendorEarnings,
      balance: vendorWallet.balance, // Current balance (not incremented yet)
      description: `Vendor earnings from order #${orderNumber || orderId}`,
      reference: `VENDOR-EARN-${orderId}`,
      orderId: orderId,
      status: 'PENDING', // Will be completed when rider completes delivery
      metadata: {
        orderId,
        orderNumber,
        vendorEarnings,
        vendorCommission: commissions?.vendorCommission,
        vendorCommissionRate: commissions?.vendorCommissionRate,
        platformCommission: commissions?.platformCommission,
        platformCommissionRate: commissions?.platformCommissionRate,
        module,
        ...metadata
      }
    }
  })

  // Create payment record
  const payment = await tx.payment.create({
    data: {
      userId: customerId,
      orderId: orderId,
      paymentMethod: paymentData.paymentMethod,
      amount: vendorEarnings + (commissions?.vendorCommission || 0) + (commissions?.platformCommission || 0),
      currency: paymentData.currency || 'NGN',
      status: 'PAID',
      gateway: paymentData.gateway || 'PAYSTACK',
      gatewayTransactionId: paymentData.id || paymentData.transactionId,
      metadata: paymentData
    }
  })

  return {
    wallet: vendorWallet,
    walletTransaction,
    payment
  }
}

/**
 * Complete wallet transaction when rider marks order as delivered
 * This increments the wallet balance and marks transaction as COMPLETED
 */
export async function completePharmacyPayment(
  orderId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma

  // Find pending wallet transaction for this order
  const pendingTransaction = await client.walletTransaction.findFirst({
    where: {
      orderId: orderId,
      status: 'PENDING',
      type: 'CREDIT'
    }
  })

  if (!pendingTransaction) {
    console.warn(`No pending wallet transaction found for order ${orderId}`)
    return
  }

  // Get wallet
  const wallet = await client.wallet.findUnique({
    where: { userId: pendingTransaction.userId }
  })

  if (!wallet) {
    throw new Error(`Wallet not found for user ${pendingTransaction.userId}`)
  }

  // Calculate new balance
  const newBalance = wallet.balance + pendingTransaction.amount

  // Update wallet balance and transaction status
  await Promise.all([
    client.wallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance }
    }),
    client.walletTransaction.update({
      where: { id: pendingTransaction.id },
      data: {
        status: 'COMPLETED',
        balance: newBalance
      }
    })
  ])
}

/**
 * After delivery: complete pending wholesaler credit from checkout, or create a completed credit if none existed
 * (e.g. gateway path skipped creating PENDING wallet rows).
 */
export async function ensureWholesalerSupplierOrderPayoutCompleted(supplierOrderId: string): Promise<void> {
  await completePharmacyPayment(supplierOrderId)

  const so = await prisma.supplierOrder.findUnique({
    where: { id: supplierOrderId },
    include: { wholesaler: { select: { userId: true } } },
  })
  if (!so) return

  const wholesalerUserId = so.wholesaler.userId

  const alreadyDone = await prisma.walletTransaction.findFirst({
    where: {
      userId: wholesalerUserId,
      orderId: supplierOrderId,
      status: "COMPLETED",
      type: "CREDIT",
    },
  })
  if (alreadyDone) return

  const stillPending = await prisma.walletTransaction.findFirst({
    where: {
      userId: wholesalerUserId,
      orderId: supplierOrderId,
      status: "PENDING",
      type: "CREDIT",
    },
  })
  if (stillPending) {
    await completeWalletTransaction(stillPending.id)
    return
  }

  if (so.paymentStatus !== "PAID") {
    console.warn(
      `[ensureWholesalerSupplierOrderPayoutCompleted] supplier order ${supplierOrderId} paymentStatus is not PAID; skipping fallback vendor credit`
    )
    return
  }

  const orderAmount = so.totalAmount || 0
  if (orderAmount <= 0) return

  let platformFee = 0
  let wholesaleCommission = 0
  const mod = "WHOLESALER" as Module
  try {
    const platformCalc = await calculateCommission(mod, orderAmount, CommissionType.PLATFORM_FEE)
    platformFee = platformCalc.commissionAmount
    const wholesaleCalc = await calculateCommission(mod, orderAmount, CommissionType.WHOLESALE_ORDER)
    wholesaleCommission = wholesaleCalc.commissionAmount
  } catch (e) {
    console.warn("[ensureWholesalerSupplierOrderPayoutCompleted] commission calc:", e)
  }

  const vendorNet = Math.max(0, orderAmount - platformFee - wholesaleCommission)
  if (vendorNet <= 0) return

  const dup = await prisma.walletTransaction.findFirst({
    where: {
      reference: `supplier-vendor-delivery:${supplierOrderId}`,
    },
  })
  if (dup) return

  await createWalletTransaction({
    userId: wholesalerUserId,
    type: "CREDIT",
    amount: vendorNet,
    description: `Wholesale delivery payout #${so.orderNumber}`,
    orderId: supplierOrderId,
    status: "COMPLETED",
    reference: `supplier-vendor-delivery:${supplierOrderId}`,
    metadata: {
      supplierOrderId,
      transactionType: "ORDER_PAYMENT",
      source: "supplier_order_delivery_fallback",
    },
  })
}

/**
 * Mark commissions as PAID when order is completed
 * For regular orders: finds by orderId
 * For supplier orders: finds by vendorIds and time window (since orderId is not stored)
 */
export async function markCommissionsAsPaid(
  orderId: string,
  tx?: Prisma.TransactionClient,
  options?: {
    isSupplierOrder?: boolean
    vendorIds?: string[] // For supplier orders: wholesaler.userId and pharmacy.userId
    orderCreatedAt?: Date // For supplier orders: approximate time when commissions were created
  }
): Promise<void> {
  const client = tx || prisma

  if (options?.isSupplierOrder && options.vendorIds && options.vendorIds.length > 0) {
    // For supplier orders: find commissions by vendorIds and time window
    // Commissions are created right after order acceptance, so we use a time window
    const timeWindowStart = options.orderCreatedAt 
      ? new Date(options.orderCreatedAt.getTime() - 5 * 60 * 1000) // 5 minutes before
      : new Date(Date.now() - 60 * 60 * 1000) // Default: last hour
    const timeWindowEnd = options.orderCreatedAt
      ? new Date(options.orderCreatedAt.getTime() + 5 * 60 * 1000) // 5 minutes after
      : new Date() // Default: now

    // Update PENDING commissions for all vendorIds within time window
    await client.vendorCommission.updateMany({
      where: {
        vendorId: { in: options.vendorIds },
        status: 'PENDING',
        createdAt: {
          gte: timeWindowStart,
          lte: timeWindowEnd
        },
        // Filter for relevant modules and commission types
        OR: [
          { module: 'WHOLESALER', commissionType: 'PLATFORM_FEE' },
          { module: 'WHOLESALER', commissionType: 'WHOLESALE_ORDER' },
          { module: 'PHARMACY', commissionType: 'WHOLESALE_ORDER' },
        ]
      },
      data: {
        status: 'PAID',
        paidAt: new Date()
      }
    })
  } else {
    // For regular orders: find by orderId
    await client.vendorCommission.updateMany({
      where: {
        orderId: orderId,
        status: 'PENDING'
      },
      data: {
        status: 'PAID',
        paidAt: new Date()
      }
    })
  }
}
