import { prisma } from "@/lib/prisma"
import { executeRefundApproval, getRefundMeta } from "@/lib/admin-refund-approve"

const COMPLETED_ORDER_STATUSES = ["DELIVERED", "COMPLETED"] as const
const COMPLETED_RIDE_STATUSES = ["DELIVERED", "COMPLETED"] as const

export type MicroAutoRefundSettings = {
  autoRefundThreshold: number
  loyalCompletedOrdersMin: number
  loyalCompletedRidesMin: number
}

/** Resolve refund settings shape from company info blob (same defaults as admin refund settings route). */
export function parseMicroAutoSettings(refundSettingsRaw: Record<string, unknown>): MicroAutoRefundSettings {
  const autoRefundThreshold =
    typeof refundSettingsRaw.autoRefundThreshold === "number" && Number.isFinite(refundSettingsRaw.autoRefundThreshold)
      ? refundSettingsRaw.autoRefundThreshold
      : 20
  const loyalCompletedOrdersMin =
    typeof refundSettingsRaw.loyalCompletedOrdersMin === "number" &&
    Number.isFinite(refundSettingsRaw.loyalCompletedOrdersMin)
      ? refundSettingsRaw.loyalCompletedOrdersMin
      : 50
  const loyalCompletedRidesMin =
    typeof refundSettingsRaw.loyalCompletedRidesMin === "number" &&
    Number.isFinite(refundSettingsRaw.loyalCompletedRidesMin)
      ? refundSettingsRaw.loyalCompletedRidesMin
      : 15
  return { autoRefundThreshold, loyalCompletedOrdersMin, loyalCompletedRidesMin }
}

async function isTrustedCustomer(
  customerId: string,
  settings: MicroAutoRefundSettings,
): Promise<{ trusted: boolean; completedOrders: number; completedRides: number }> {
  const [completedOrders, completedRides] = await Promise.all([
    prisma.order.count({
      where: {
        customerId,
        status: { in: [...COMPLETED_ORDER_STATUSES] },
      },
    }),
    prisma.rideBooking.count({
      where: {
        customerId,
        status: { in: [...COMPLETED_RIDE_STATUSES] },
      },
    }),
  ])
  const trusted =
    completedOrders >= settings.loyalCompletedOrdersMin && completedRides >= settings.loyalCompletedRidesMin
  return { trusted, completedOrders, completedRides }
}

/**
 * After a customer submits a wallet refund request (metadata already saved as PENDING),
 * immediately approve if threshold + trusted rules match. Skips physical-return deferrals.
 */
export async function tryAutoApproveMicroWalletRefund(paymentId: string): Promise<boolean> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true },
  })
  if (!payment?.user) return false

  const refund = getRefundMeta(payment.metadata)
  if (!refund || String(refund.status || "PENDING") !== "PENDING") return false
  if (String(refund.refundMethod || "") !== "WALLET") return false

  const requestedRefundAmount = Number(refund.requestedRefundAmount ?? 0)
  if (!(requestedRefundAmount > 0)) return false

  const sys = await prisma.systemSettings.findFirst({ select: { compnyinfo: true } })
  const comp =
    sys?.compnyinfo && typeof sys.compnyinfo === "object" && !Array.isArray(sys.compnyinfo)
      ? (sys.compnyinfo as Record<string, unknown>)
      : {}
  const refundSettingsRaw =
    comp.refundSettings && typeof comp.refundSettings === "object" && !Array.isArray(comp.refundSettings)
      ? (comp.refundSettings as Record<string, unknown>)
      : {}
  const micro = parseMicroAutoSettings(refundSettingsRaw)

  if (!(micro.autoRefundThreshold > 0 && requestedRefundAmount <= micro.autoRefundThreshold)) {
    return false
  }

  const { trusted } = await isTrustedCustomer(payment.userId, micro)
  if (!trusted) return false

  const sourceOrderId = String(refund.sourceOrderId || payment.orderId || "")
  const sourceOrder = sourceOrderId
    ? await prisma.order.findUnique({
        where: { id: sourceOrderId },
        select: { address: { select: { id: true } } },
      })
    : null
  const shouldDeferSettlement = Boolean(sourceOrder?.address && sourceOrderId)
  if (shouldDeferSettlement) return false

  const result = await executeRefundApproval({
    payment,
    processedBy: "system-micro-auto-refund",
    adminNote: "Auto-approved: trusted customer (completed orders & rides), wallet refund under threshold.",
  })

  return result.ok === true
}
