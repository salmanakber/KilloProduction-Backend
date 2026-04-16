import { CommissionType, type Module } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createWalletTransaction } from "@/lib/wallet-transaction-service"
import { calculateCommission } from "@/lib/commission-service"
import {
  bumpRiderBonusOnDeliveryEarning,
  getActivePeakBonusCommissionMultiplier,
} from "@/lib/rider-bonus-engine"

interface CreateRiderEarningParams {
  riderId: string
  rideBookingId?: string
  courierBookingId?: string
  totalAmount: number // Original amount before discount (estimatedFare)
  finalAmount?: number // Final amount after discount (finalFare) - optional, defaults to totalAmount
  description?: string
  promoCodeDiscount?: number // Discount amount to apply
  promoCodeId?: string
}

/** Map courierBooking.module string → Prisma Module for RIDER_COMMISSION settings. */
const COURIER_MODULE_MAP: Record<string, Module> = {
  PHARMACY: "PHARMACY",
  GROCERY: "GROCERY",
  FOOD: "FOOD",
  AUTO_PARTS: "AUTO_PARTS",
  COURIER: "COURIER",
  RIDING: "RIDING",
  RIDE: "RIDING",
  WHOLESALER: "PHARMACY",
}

export async function resolveRiderCommissionModule(params: {
  rideBookingId?: string | null
  courierBookingId?: string | null
}): Promise<Module> {
  if (params.rideBookingId) return "RIDING"
  if (params.courierBookingId) {
    const cb = await prisma.courierBooking.findUnique({
      where: { id: params.courierBookingId },
      select: { module: true },
    })
    const key = (cb?.module || "COURIER").toUpperCase()
    return COURIER_MODULE_MAP[key] || "COURIER"
  }
  return "COURIER"
}

/**
 * Calculate commission and create rider earning entry.
 * Uses RIDER_COMMISSION for the delivery/ride module (not PLATFORM_FEE).
 * If promo code is applied, discount is first applied to commission, then to rider amount.
 */
export async function createRiderEarning({
  riderId,
  rideBookingId,
  courierBookingId,
  totalAmount,
  finalAmount,
  description,
  promoCodeDiscount = 0,
  promoCodeId,
}: CreateRiderEarningParams) {
  try {
    const originalAmount = totalAmount
    const actualFinalAmount = finalAmount ?? totalAmount

    const commissionModule = await resolveRiderCommissionModule({
      rideBookingId,
      courierBookingId,
    })

    let commissionAmount = 0
    let commissionRate = 0
    try {
      const calc = await calculateCommission(
        commissionModule,
        originalAmount,
        CommissionType.RIDER_COMMISSION
      )
      commissionAmount = calc.commissionAmount
      commissionRate = calc.commissionRate
    } catch {
      commissionAmount = 0
      commissionRate = 0
    }

    let finalCommissionAmount = commissionAmount
    let riderDiscountAmount = 0
    let commissionDiscountAmount = 0

    if (promoCodeDiscount > 0) {
      if (promoCodeDiscount <= commissionAmount) {
        commissionDiscountAmount = promoCodeDiscount
        finalCommissionAmount = commissionAmount - promoCodeDiscount
        riderDiscountAmount = 0
      } else {
        commissionDiscountAmount = commissionAmount
        finalCommissionAmount = 0
        riderDiscountAmount = promoCodeDiscount - commissionAmount
      }
    }

    const netAmount = Math.max(
      0,
      originalAmount - finalCommissionAmount - riderDiscountAmount
    )

    const riderEarning = await prisma.riderEarning.create({
      data: {
        riderId,
        rideBookingId: rideBookingId || null,
        orderId: courierBookingId || null,
        type: "DELIVERY_FEE",
        amount: originalAmount,
        commission: finalCommissionAmount,
        netAmount,
        status: "PENDING",
        description:
          (description ||
            `Earning from ${rideBookingId ? "ride" : "courier"} booking`) + peakBonusTag,
      },
    })

    await prisma.riderCommission.create({
      data: {
        riderId,
        rideBookingId: rideBookingId || null,
        courierBookingId: courierBookingId || null,
        module: commissionModule,
        commissionType: CommissionType.RIDER_COMMISSION,
        orderAmount: originalAmount,
        commissionRate,
        commissionAmount: finalCommissionAmount,
        status: "PENDING",
      },
    })

    void bumpRiderBonusOnDeliveryEarning(riderId).catch(() => {})

    return {
      ...riderEarning,
      promoCodeDiscount,
      commissionDiscountAmount,
      riderDiscountAmount,
    }
  } catch (error) {
    console.error("Error creating rider earning:", error)
    throw error
  }
}

async function riderAlreadyReceivedCourierDeliveryWallet(
  riderId: string,
  courierBookingId: string
): Promise<boolean> {
  const byRef = await prisma.walletTransaction.findFirst({
    where: {
      userId: riderId,
      status: "COMPLETED",
      reference: `courier:${courierBookingId}:delivery`,
    },
  })
  if (byRef) return true

  const recent = await prisma.walletTransaction.findMany({
    where: { userId: riderId, status: "COMPLETED", type: "CREDIT" },
    take: 80,
    orderBy: { createdAt: "desc" },
  })
  return recent.some((t) => {
    const m = t.metadata as { courierBookingId?: string; transactionType?: string } | null
    return (
      m?.courierBookingId === courierBookingId &&
      (m?.transactionType === "DELIVERY_PAYMENT" || m?.transactionType === "ORDER_PAYMENT")
    )
  })
}

/**
 * Credit rider wallet for net payout after marking earnings PAID (idempotent).
 * Skips when marketplace order flow already completed a delivery wallet line for this booking.
 */
async function creditNetPayoutWallet(params: {
  riderId: string
  totalNet: number
  rideBookingId?: string
  courierBookingId?: string
  skipWallet: boolean
}) {
  const { riderId, totalNet, rideBookingId, courierBookingId, skipWallet } = params
  if (skipWallet || totalNet <= 0 || !Number.isFinite(totalNet)) return

  const reference = rideBookingId
    ? `earning-payout:ride:${rideBookingId}`
    : `earning-payout:courier:${courierBookingId}`

  const existing = await prisma.walletTransaction.findFirst({
    where: { userId: riderId, reference },
  })
  if (existing) return

  if (courierBookingId && (await riderAlreadyReceivedCourierDeliveryWallet(riderId, courierBookingId))) {
    return
  }

  await createWalletTransaction({
    userId: riderId,
    type: "CREDIT",
    amount: Math.round(totalNet * 100) / 100,
    description: rideBookingId
      ? `Ride payout for booking ${rideBookingId}`
      : `Courier payout for booking ${courierBookingId}`,
    status: "COMPLETED",
    reference,
    metadata: {
      transactionType: "EARNING_PAYOUT",
      rideBookingId: rideBookingId ?? undefined,
      courierBookingId: courierBookingId ?? undefined,
    },
  })
}

/**
 * Update rider earning status to PAID, mark RiderCommission as PAID, and credit rider wallet (netAmount) when appropriate.
 */
export async function markRiderEarningAsPaid(
  rideBookingId?: string,
  courierBookingId?: string
) {
  try {
    const earningWhere: Record<string, string> = {}
    if (rideBookingId) {
      earningWhere.rideBookingId = rideBookingId
    } else if (courierBookingId) {
      earningWhere.orderId = courierBookingId
    } else {
      throw new Error("Either rideBookingId or courierBookingId must be provided")
    }

    const pendingRows = await prisma.riderEarning.findMany({
      where: { ...earningWhere, status: "PENDING" },
    })

    if (pendingRows.length === 0) {
      return { earning: { count: 0 }, commission: { count: 0 }, walletSkipped: true }
    }

    const riderId = pendingRows[0].riderId
    const totalNet = pendingRows.reduce((s, e) => s + (e.netAmount || 0), 0)

    const updatedEarning = await prisma.riderEarning.updateMany({
      where: { ...earningWhere, status: "PENDING" },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    })

    if (rideBookingId) {
      await prisma.riderCommission.updateMany({
        where: { rideBookingId, status: "PENDING" },
        data: { status: "PAID", paidAt: new Date() },
      })
    } else if (courierBookingId) {
      await prisma.riderCommission.updateMany({
        where: {
          status: "PENDING",
          OR: [{ courierBookingId }, { rideBookingId: courierBookingId }],
        },
        data: { status: "PAID", paidAt: new Date() },
      })
    }

    let skipWallet = false
    if (courierBookingId) {
      const cb = await prisma.courierBooking.findUnique({
        where: { id: courierBookingId },
        select: { orderId: true },
      })
      if (cb?.orderId) {
        skipWallet = true
      } else {
        skipWallet = await riderAlreadyReceivedCourierDeliveryWallet(riderId, courierBookingId)
      }
    }

    await creditNetPayoutWallet({
      riderId,
      totalNet,
      rideBookingId,
      courierBookingId,
      skipWallet,
    })

    return {
      earning: updatedEarning,
      commission: { count: 1 },
      walletSkipped: skipWallet,
    }
  } catch (error) {
    console.error("Error updating rider earning status:", error)
    throw error
  }
}
