import { prisma } from '@/lib/prisma'
import { CommissionType } from '@prisma/client'
import type { CommissionStatus, Module } from '@prisma/client'

export interface CreateCommissionParams {
  module: Module
  orderId?: string
  propertyBookingId?: string
  rideBookingId?: string
  courierBookingId?: string
  vendorId?: string
  riderId?: string
  orderAmount: number
  commissionType: CommissionType
  status?: CommissionStatus
}

export interface CommissionCalculationResult {
  commissionRate: number
  commissionAmount: number
  minAmount: number | null
  maxAmount: number | null
}

/**
 * Calculate commission based on module and commission type
 */
export async function calculateCommission(
  module: Module,
  orderAmount: number,
  commissionType: CommissionType
): Promise<CommissionCalculationResult> {
  const commissionSetting = await prisma.commissionSetting.findFirst({
    where: {
      module,
      commissionType,
      isActive: true,
    },
  })

  

  if (!commissionSetting) {
    throw new Error(`Commission setting not found for module: ${module}, type: ${commissionType}`)
  }

  // Calculate commission amount
  let commissionAmount = (orderAmount * commissionSetting.rate) / 100

  // Apply min/max limits only when rate > 0
  if (
    commissionSetting.rate > 0 &&
    commissionSetting.minAmount != null &&
    commissionAmount < commissionSetting.minAmount
  ) {
    commissionAmount = commissionSetting.minAmount
  }

  if (
    commissionSetting.rate > 0 &&
    commissionSetting.maxAmount != null &&
    commissionAmount > commissionSetting.maxAmount
  ) {
    commissionAmount = commissionSetting.maxAmount
  }

  return {
    commissionRate: commissionSetting.rate,
    commissionAmount: Math.round(commissionAmount * 100) / 100,
    minAmount: commissionSetting.minAmount,
    maxAmount: commissionSetting.maxAmount,
  }
}
/**
 * Like calculateCommission but returns 0 when no active setting exists (e.g. optional VENDOR_COMMISSION).
 */
export async function tryCalculateCommissionAmount(
  module: Module,
  orderAmount: number,
  commissionType: CommissionType
): Promise<number> {
  if (!Number.isFinite(orderAmount) || orderAmount <= 0) return 0
  try {
    const r = await calculateCommission(module, orderAmount, commissionType)
    return r.commissionAmount
  } catch {
    return 0
  }
}

/** Legacy defaults when no active PLATFORM_FEE row exists for the module (customer-facing fee). */
const CHECKOUT_PLATFORM_FEE_DEFAULTS: Partial<
  Record<Module, { rate: number; min?: number; max?: number }>
> = {
  PHARMACY: { rate: 8, min: 15, max: 800 },
  GROCERY: { rate: 8, min: 15, max: 800 },
  FOOD: { rate: 8, min: 15, max: 800 },
  AUTO_PARTS: { rate: 3 },
  PROPERTY: { rate: 5, min: 50, max: 5000 },
}

/**
 * Customer platform fee for checkout totals. `module` selects which CommissionSetting / defaults apply.
 */
export async function checkoutPlatformFeeAmount(
  module: Module,
  discountedSubtotal: number
): Promise<number> {
  if (!Number.isFinite(discountedSubtotal) || discountedSubtotal <= 0) return 0

  const setting = await prisma.commissionSetting.findFirst({
    where: {
      module,
      commissionType: CommissionType.PLATFORM_FEE,
      isActive: true,
    },
  })

  if (setting) {
    let commissionAmount = (discountedSubtotal * setting.rate) / 100
    if (setting.minAmount != null && commissionAmount < setting.minAmount) {
      commissionAmount = setting.minAmount
    }
    if (setting.maxAmount != null && commissionAmount > setting.maxAmount) {
      commissionAmount = setting.maxAmount
    }
    return Math.round(commissionAmount * 100) / 100
  }

  const d = CHECKOUT_PLATFORM_FEE_DEFAULTS[module]
  if (!d) return 0
  let amt = (discountedSubtotal * d.rate) / 100
  if (d.min != null) amt = Math.max(amt, d.min)
  if (d.max != null) amt = Math.min(amt, d.max)
  return Math.round(amt * 100) / 100
}

/**
 * Vendor commission on discounted merchandise subtotal. `module` is required — resolves VENDOR_COMMISSION for that module only (0 if unset).
 */
export async function checkoutVendorCommissionAmount(
  module: Module,
  discountedSubtotal: number
): Promise<number> {
  return tryCalculateCommissionAmount(module, discountedSubtotal, CommissionType.VENDOR_COMMISSION)
}

/**
 * Create vendor commission record
 */
export async function createVendorCommission(params: CreateCommissionParams): Promise<any> {
  if (!params.vendorId) {
    throw new Error('Vendor ID is required for vendor commission')
  }

  const calculation = await calculateCommission(
    params.module,
    params.orderAmount,
    params.commissionType
  )

  const commission = await prisma.vendorCommission.create({
    data: {
      vendorId: params.vendorId,
      orderId: params.orderId,
      propertyBookingId: params.propertyBookingId,
      module: params.module,
      commissionType: params.commissionType,
      orderAmount: params.orderAmount,
      commissionRate: calculation.commissionRate,
      commissionAmount: calculation.commissionAmount,
      status: params.status || 'PENDING',
    },
  })

  return commission
}

/**
 * Create rider commission record
 */
export async function createRiderCommission(params: CreateCommissionParams): Promise<any> {
  if (!params.riderId) {
    throw new Error('Rider ID is required for rider commission')
  }

  const calculation = await calculateCommission(
    params.module,
    params.orderAmount,
    params.commissionType
  )

  const commission = await prisma.riderCommission.create({
    data: {
      riderId: params.riderId,
      orderId: params.orderId,
      rideBookingId: params.rideBookingId,
      courierBookingId: params.courierBookingId,
      module: params.module,
      commissionType: params.commissionType,
      orderAmount: params.orderAmount,
      commissionRate: calculation.commissionRate,
      commissionAmount: calculation.commissionAmount,
      status: params.status || 'PENDING',
    },
  })

  return commission
}

/**
 * Mark commission as paid
 */
export async function markCommissionAsPaid(
  commissionId: string,
  commissionType: 'VENDOR' | 'RIDER'
): Promise<void> {
  if (commissionType === 'VENDOR') {
    await prisma.vendorCommission.update({
      where: { id: commissionId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    })
  } else {
    await prisma.riderCommission.update({
      where: { id: commissionId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    })
  }
}

/**
 * Get all pending commissions for a user
 */
export async function getPendingCommissions(
  userId: string,
  userType: 'VENDOR' | 'RIDER'
): Promise<any[]> {
  if (userType === 'VENDOR') {
    return await prisma.vendorCommission.findMany({
      where: {
        vendorId: userId,
        status: 'PENDING',
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            total: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
  } else {
    return await prisma.riderCommission.findMany({
      where: {
        riderId: userId,
        status: 'PENDING',
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            total: true,
          },
        },
        rideBooking: {
          select: {
            id: true,
            bookingNumber: true,
            fare: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
  }
}
