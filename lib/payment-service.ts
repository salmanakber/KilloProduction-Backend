import { prisma } from '@/lib/prisma'
import type { PaymentStatus } from '@prisma/client'

export interface CreatePaymentParams {
  userId: string
  amount: number
  currency: string
  status: PaymentStatus
  gateway: string
  gatewayTransactionId?: string
  orderId?: string
  description?: string
  metadata?: any
  paymentMethodId?: string
}

export interface CreateSplitPaymentParams {
  userId: string
  currency: string
  status: PaymentStatus
  gateway: string
  gatewayTransactionId?: string
  description?: string
  metadata?: any
  paymentMethodId?: string
  vendorPayments: Array<{
    vendorId: string
    orderId: string
    amount: number
  }>
  riderPayment?: {
    riderId: string
    courierBookingId?: string
    rideBookingId?: string
    amount: number
  }
}

/**
 * Create a single payment record
 */
export async function createPayment(params: CreatePaymentParams): Promise<any> {
  return await prisma.payment.create({
    data: {
      userId: params.userId,
      amount: params.amount,
      currency: params.currency,
      status: params.status,
      gateway: params.gateway,
      gatewayTransactionId: params.gatewayTransactionId,
      orderId: params.orderId,
      description: params.description,
      metadata: params.metadata,
      paymentMethodId: params.paymentMethodId,
    },
  })
}

/**
 * Generate a unique payment group ID for grouping related payments
 */
function generatePaymentGroupId(): string {
  return `PG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
}

/**
 * Create split payments for multiple orders (vendor payments + rider payment)
 * For example: 2 stores = 2 vendor payments + 1 rider payment = 3 total payments
 * All payments in a group share the same paymentGroupId in metadata for easy querying
 */
export async function createSplitPayments(params: CreateSplitPaymentParams): Promise<{
  vendorPayments: any[]
  riderPayment: any | null
  totalAmount: number
  paymentGroupId: string
}> {
  // Generate a unique payment group ID for this transaction
  const paymentGroupId = generatePaymentGroupId()
  const vendorPayments = []
  let totalAmount = 0

  // Create payment for each vendor order
  for (const vendorPayment of params.vendorPayments) {
    const payment = await createPayment({
      userId: params.userId,
      amount: vendorPayment.amount,
      currency: params.currency,
      status: params.status,
      gateway: params.gateway,
      gatewayTransactionId: params.gatewayTransactionId,
      orderId: vendorPayment.orderId,
      description: params.description || `Payment for order ${vendorPayment.orderId}`,
      metadata: {
        ...(params.metadata || {}),
        vendorId: vendorPayment.vendorId,
        paymentType: 'VENDOR',
        paymentGroupId, // Group identifier
      },
      paymentMethodId: params.paymentMethodId,
    })
    vendorPayments.push(payment)
    totalAmount += vendorPayment.amount
  }

  // Create payment for rider if provided
  let riderPayment = null
  if (params.riderPayment) {
    riderPayment = await createPayment({
      userId: params.userId,
      amount: params.riderPayment.amount,
      currency: params.currency,
      status: params.status,
      gateway: params.gateway,
      gatewayTransactionId: params.gatewayTransactionId,
      description: params.description || `Payment for rider delivery`,
      metadata: {
        ...params.metadata,
        riderId: params.riderPayment.riderId,
        courierBookingId: params.riderPayment.courierBookingId,
        rideBookingId: params.riderPayment.rideBookingId,
        paymentType: 'RIDER',
        paymentGroupId, // Same group identifier
      },
      paymentMethodId: params.paymentMethodId,
    })
    totalAmount += params.riderPayment.amount
  }

  return {
    vendorPayments,
    riderPayment,
    totalAmount,
    paymentGroupId,
  }
}

/**
 * Get all payments in a payment group
 */
export async function getPaymentsByGroupId(paymentGroupId: string): Promise<any[]> {
  return await prisma.payment.findMany({
    where: {
      metadata: {
        path: ['paymentGroupId'],
        equals: paymentGroupId,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  })
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus
): Promise<void> {
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status },
  })
}
