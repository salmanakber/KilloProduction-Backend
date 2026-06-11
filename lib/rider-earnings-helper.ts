import { CommissionType, type Module } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createWalletTransaction } from "@/lib/wallet-transaction-service"
import { calculateCommission } from "@/lib/commission-service"
import { bumpRiderBonusOnDeliveryEarning } from "@/lib/rider-bonus-engine"
interface CreateRiderEarningParams {
  riderId: string
  rideBookingId?: string
  courierBookingId?: string
  orderId?: string
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
  WHOLESALER: "WHOLESALER",
}

/**
 * Linked `Order.module` values that override RIDING for **RideBooking** rows (true interconnect).
 * Excludes `COURIER`: point-to-point ride jobs often get a synthetic `Order` with `module: COURIER`
 * from `/riding/book`, which must not steal the RIDING commission row.
 */
const RIDE_INTERCONNECT_COMMISSION_MODULES = new Set<Module>([
  "PHARMACY",
  "FOOD",
  "GROCERY",
  "AUTO_PARTS",
  "WHOLESALER",
])

/**
 * Resolves which `commissionSetting.module` to use for RIDER_COMMISSION on delivery/ride payouts.
 * Ride rows with a linked marketplace `Order` (interconnect) use that order's module; standalone
 * CustomerRiding trips use RIDING. Courier: WHOLESALER, linked order module, or courier.module map.
 */
export async function resolveRiderCommissionModule(params: {
  rideBookingId?: string | null
  courierBookingId?: string | null
  /** When already loaded (e.g. completion handler), avoids an extra order read. */
  orderModule?: Module | null
}): Promise<Module> {
  if (params.rideBookingId) {
    if (params.orderModule) return params.orderModule
    const rideLinkedOrder = await prisma.order.findFirst({
      where: { rideBookingId: params.rideBookingId },
      select: { module: true },
      orderBy: { createdAt: "desc" },
    })
    const mod = rideLinkedOrder?.module
    if (mod && RIDE_INTERCONNECT_COMMISSION_MODULES.has(mod)) {
      return mod
    }
    return "RIDING"
  }
  if (params.courierBookingId) {
    const cb = await prisma.courierBooking.findUnique({
      where: { id: params.courierBookingId },
      select: { module: true, orderId: true },
    })
    if (cb?.module?.toUpperCase() === "WHOLESALER") {
      return "WHOLESALER"
    }
    /** CustomerRiding / ride-like courier rows (`module` RIDE|RIDING): always use RIDING settings, not linked `Order` (often `COURIER`). */
    const courierMod = (cb?.module || "").toUpperCase()
    if (courierMod === "RIDE" || courierMod === "RIDING") {
      return "RIDING"
    }
    const hinted = params.orderModule ?? null
    if (hinted) return hinted
    if (cb?.orderId) {
      const ord = await prisma.order.findUnique({
        where: { id: cb.orderId },
        select: { module: true },
      })
      if (ord?.module) {
        return ord.module
      }
    }
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
  orderId,
  totalAmount,
  finalAmount,
  description,
  promoCodeDiscount = 0,
  promoCodeId,
}: CreateRiderEarningParams) {
  try {
    /** Standalone CustomerRiding: one pending earning per ride; no wallet row until trip completes (avoids double-count vs RiderEarning pending). */
    const isStandaloneRide = Boolean(rideBookingId && !courierBookingId)
    if (isStandaloneRide && rideBookingId) {
      const ref = `earning-payout:ride:${rideBookingId}`
      await prisma.$transaction(async (tx) => {
        await tx.walletTransaction.deleteMany({
          where: { userId: riderId, reference: ref, status: "PENDING" },
        })
        await tx.riderCommission.deleteMany({
          where: { rideBookingId, riderId, status: "PENDING" },
        })
        await tx.riderEarning.deleteMany({
          where: { rideBookingId, riderId, status: "PENDING" },
        })
      })
    }

    const listOrGrossAmount = Math.max(0, Number(totalAmount) || 0)
    const resolvedFinal = finalAmount != null ? Number(finalAmount) : null
    const actualFinalAmount =
      resolvedFinal != null && Number.isFinite(resolvedFinal)
        ? Math.max(0, resolvedFinal)
        : listOrGrossAmount
    /** Customer-agreed / charged trip fare for commission + payout (e.g. accepted bid), not list estimate. */
    const fareForPayout =
      actualFinalAmount > 0 ? actualFinalAmount : listOrGrossAmount

    const commissionModule = await resolveRiderCommissionModule({
      rideBookingId,
      courierBookingId,
    })

    let commissionAmount = 0
    let commissionRate = 0
    try {
      const calc = await calculateCommission(
        commissionModule,
        fareForPayout,
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
      fareForPayout - finalCommissionAmount - riderDiscountAmount
    )

    const riderEarning = await prisma.riderEarning.create({
      data: {
        riderId,
        rideBookingId: rideBookingId || null,
        orderId: orderId || null,
        type: "DELIVERY_FEE",
        amount: fareForPayout,
        commission: finalCommissionAmount,
        netAmount,
        status: "PENDING",
        description:
          description ||
          `Earning from ${rideBookingId ? "ride" : "courier"} booking`,
      },
    })

    await prisma.riderCommission.create({
      data: {
        riderId,
        rideBookingId: rideBookingId || null,
        courierBookingId: courierBookingId || null,
        module: commissionModule,
        commissionType: CommissionType.RIDER_COMMISSION,
        orderAmount: fareForPayout,
        commissionRate,
        commissionAmount: finalCommissionAmount,
        status: "PENDING",
      },
    })

    /** Peak bonus progress is tied to completed deliveries (see markRiderEarningAsPaid), not accept time. */
    /** Wallet CREDIT with `clearsAt` is created only in `markRiderEarningAsPaid` → `creditNetPayoutWallet` so clearance worker can settle it. */

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
      reference: `courier:${courierBookingId}:delivery`,
      status: { in: ["PENDING", "COMPLETED"] },
    },
  })
  if (byRef) return true

  const recent = await prisma.walletTransaction.findMany({
    where: { userId: riderId, status: { in: ["PENDING", "COMPLETED"] }, type: "CREDIT" },
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
    orderBy: { createdAt: "desc" },
  })
  if (existing?.status === "COMPLETED") return

  const { getRiderWalletClearanceDays, computeWalletClearsAt } = await import(
    "@/lib/rider-wallet-clearance-settings"
  )
  const days = await getRiderWalletClearanceDays()
  const clearsAtComputed = computeWalletClearsAt(days)

  if (existing?.status === "PENDING") {
    const amountRounded = Math.round(totalNet * 100) / 100
    const description = rideBookingId
      ? `Ride payout for booking ${rideBookingId} (clears in ${days} day${days === 1 ? "" : "s"})`
      : `Courier payout for booking ${courierBookingId} (clears in ${days} day${days === 1 ? "" : "s"})`
    await prisma.walletTransaction.update({
      where: { id: existing.id },
      data: {
        amount: amountRounded,
        description,
        /** Always ensure clearance is scheduled (standalone ride payouts must hit the worker). */
        clearsAt: existing.clearsAt ?? clearsAtComputed,
        metadata: {
          transactionType: "EARNING_PAYOUT",
          rideBookingId: rideBookingId ?? undefined,
          courierBookingId: courierBookingId ?? undefined,
        },
      },
    })
    return
  }

  if (existing) return

  if (courierBookingId && (await riderAlreadyReceivedCourierDeliveryWallet(riderId, courierBookingId))) {
    return
  }

  const created = await createWalletTransaction({
    userId: riderId,
    type: "CREDIT",
    amount: Math.round(totalNet * 100) / 100,
    description: rideBookingId
      ? `Ride payout for booking ${rideBookingId} (clears in ${days} day${days === 1 ? "" : "s"})`
      : `Courier payout for booking ${courierBookingId} (clears in ${days} day${days === 1 ? "" : "s"})`,
    status: "PENDING",
    reference,
    clearsAt: clearsAtComputed,
    metadata: {
      transactionType: "EARNING_PAYOUT",
      rideBookingId: rideBookingId ?? undefined,
      courierBookingId: courierBookingId ?? undefined,
    },
  })

  if (created?.id && !created.clearsAt) {
    await prisma.walletTransaction.update({
      where: { id: created.id },
      data: { clearsAt: clearsAtComputed },
    })
  }
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
      const booking = await prisma.courierBooking.findUnique({
        where: { id: courierBookingId },
        select: { orderId: true },
      })
      if (booking?.orderId) {
        earningWhere.orderId = booking.orderId
      } else {
        // Backward-compatible fallback for older malformed rows where orderId=courierBookingId
        earningWhere.orderId = courierBookingId
      }
    } else {
      throw new Error("Either rideBookingId or courierBookingId must be provided")
    }

    const pendingRows = await prisma.riderEarning.findMany({
      where: { ...earningWhere, status: "PENDING" },
    })

    let riderId: string | null = pendingRows[0]?.riderId || null
    if (!riderId && rideBookingId) {
      const ride = await prisma.rideBooking.findUnique({
        where: { id: rideBookingId },
        select: { riderId: true },
      })
      riderId = ride?.riderId || null
    }
    if (!riderId && courierBookingId) {
      const booking = await prisma.courierBooking.findUnique({
        where: { id: courierBookingId },
        select: { riderId: true },
      })
      riderId = booking?.riderId || null
    }

    if (pendingRows.length === 0) {
      if (riderId) {
        void bumpRiderBonusOnDeliveryEarning(riderId).catch(() => {})
      }
      return { earning: { count: 0 }, commission: { count: 0 }, walletSkipped: true }
    }

    if (!riderId) {
      throw new Error("Unable to resolve rider for earning payout.")
    }

    if (rideBookingId) {
      const ride = await prisma.rideBooking.findUnique({
        where: { id: rideBookingId },
        select: { paymentMethod: true },
      })
      if (String(ride?.paymentMethod || "").toUpperCase() === "PAY_ON_ARRIVAL") {
        return { earning: { count: 0 }, commission: { count: 0 }, walletSkipped: true }
      }
    }

    const totalNet = pendingRows.reduce((s, e) => s + (e.netAmount || 0), 0)

    const updatedEarning = await prisma.riderEarning.updateMany({
      where: { ...earningWhere, riderId, status: "PENDING" },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    })

    if (rideBookingId) {
      await prisma.riderCommission.updateMany({
        where: { rideBookingId, riderId, status: "PENDING" },
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
        // Only skip rider wallet when this booking is tied to a real marketplace Order (food/grocery/etc.).
        // Pharmacy→supplier jobs may store unrelated strings in orderId or have no Order row — those must use courier earning payout.
        const linkedMarketplaceOrder = await prisma.order.findUnique({
          where: { id: cb.orderId },
          select: { id: true },
        })
        skipWallet = Boolean(linkedMarketplaceOrder)
      } else {
        skipWallet = await riderAlreadyReceivedCourierDeliveryWallet(riderId, courierBookingId)
      }
    }

    if (rideBookingId) {
      /** Rebuild payout from pending earnings total (old flow could leave wrong PENDING amount vs. bid). */
      const ref = `earning-payout:ride:${rideBookingId}`
      await prisma.walletTransaction.deleteMany({
        where: { userId: riderId, reference: ref, status: "PENDING" },
      })
      if (totalNet > 0) {
        await creditNetPayoutWallet({
          riderId,
          totalNet,
          rideBookingId,
          courierBookingId: undefined,
          skipWallet: false,
        })
      }
    } else {
      await creditNetPayoutWallet({
        riderId,
        totalNet,
        rideBookingId,
        courierBookingId,
        skipWallet,
      })
    }
    void bumpRiderBonusOnDeliveryEarning(riderId).catch(() => {})

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
