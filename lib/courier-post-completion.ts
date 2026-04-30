import { prisma } from "@/lib/prisma"
import {
  completeOrderWalletTransactions,
  ensureOrderCompletionPendingWallets,
  ensureRiderDeliveryWalletCompleted,
} from "@/lib/wallet-transaction-service"
import { createRiderCommission, tryCalculateCommissionAmount } from "@/lib/commission-service"
import {
  ensureWholesalerSupplierOrderPayoutCompleted,
  markCommissionsAsPaid,
} from "@/lib/pharmacy-payment-service"
import { markRiderEarningAsPaid, resolveRiderCommissionModule } from "@/lib/rider-earnings-helper"
import { splitAmountByWeights } from "@/lib/order-vendor-platform-fee-record"
import { CommissionStatus, CommissionType, type Module } from "@prisma/client"
import {
  computeVendorOfferSettlementPayout,
  usesOfferSettlementModule,
} from "@/lib/pharmacy-vendor-settlement"

/**
 * Run wallet completion, commissions, and supplier payouts after a courier booking
 * is persisted as COMPLETED. Safe to call from status PUT or delivery QR verification.
 */
export async function runCourierCompletionSideEffects(courierBookingId: string): Promise<void> {
  const updatedBooking = await prisma.courierBooking.findUnique({
    where: { id: courierBookingId },
    include: {
      supplierOrders: {
        include: {
          wholesaler: { select: { userId: true, id: true } },
          pharmacy: { select: { userId: true, id: true } },
        },
      },
    },
  })

  if (!updatedBooking) return
  const done =
    updatedBooking.status === "COMPLETED" ||
    updatedBooking.status === "DELIVERED"
  if (!done || !updatedBooking.riderId) {
    return
  }

  const courierBooking = updatedBooking
  const deliveryFee = updatedBooking.fare || 0
  const riderId = updatedBooking.riderId

  type UpdatedOrder = {
    id: string
    module: string
    vendorId: string | null
    total: number
    subtotal: number
    discount: number
    vendorCommission: number
    deliveryFee: number
    isChildOrder: boolean
    childId: string | null
  }
  let updatedOrder: UpdatedOrder | null = null

  if (updatedBooking.orderId) {
    const o = await prisma.order.findUnique({
      where: { id: updatedBooking.orderId },
      select: {
        id: true,
        module: true,
        vendorId: true,
        total: true,
        subtotal: true,
        discount: true,
        vendorCommission: true,
        deliveryFee: true,
        isChildOrder: true,
        childId: true,
      },
    })
    if (o) updatedOrder = o as unknown as UpdatedOrder
  }

  const riderCommissionModule = await resolveRiderCommissionModule({
    courierBookingId: courierBooking.id,
    orderModule: updatedOrder?.module as Module | undefined,
  })
  /** Wholesale: RIDER_COMMISSION on delivery fee uses WHOLESALER settings (see pharmacy quote accept). */
  const riderCutModule: Module =
    courierBooking.module === "WHOLESALER" ? "WHOLESALER" : riderCommissionModule
  const riderCutFromDelivery = await tryCalculateCommissionAmount(
    riderCutModule,
    deliveryFee,
    CommissionType.RIDER_COMMISSION
  )

  /** Vendor→supplier (WHOLESALER): RiderEarning must exist for markRiderEarningAsPaid + ledger; accept-route may have skipped or failed. */
  if (
    courierBooking.module === "WHOLESALER" &&
    (courierBooking.supplierOrders?.length ?? 0) > 0 &&
    riderId &&
    deliveryFee > 0
  ) {
    try {
      const existingEarn = await prisma.riderEarning.findFirst({
        where: { riderId, orderId: courierBookingId },
      })
      if (!existingEarn) {
        const { createRiderEarning } = await import("@/lib/rider-earnings-helper")
        await createRiderEarning({
          riderId,
          courierBookingId,
          totalAmount: deliveryFee,
          finalAmount: deliveryFee,
          description: `Wholesale supplier delivery ${courierBooking.bookingNumber || courierBookingId}`,
        })
      }
    } catch (earnErr) {
      console.error("WHOLESALER ensure rider earning:", earnErr)
    }
  }

  try {
    if (courierBooking.supplierOrders && courierBooking.supplierOrders.length > 0) {
      for (const supplierOrder of courierBooking.supplierOrders) {
        try {
          await ensureWholesalerSupplierOrderPayoutCompleted(supplierOrder.id)

          await markCommissionsAsPaid(supplierOrder.id, undefined, {
            isSupplierOrder: true,
            vendorIds: [supplierOrder.wholesaler.userId, supplierOrder.pharmacy.userId],
            orderCreatedAt: supplierOrder.createdAt,
          })

          const existingRiderCommission = await prisma.riderCommission.findFirst({
            where: {
              courierBookingId: courierBookingId,
              riderId: riderId,
              commissionType: "RIDER_COMMISSION",
              status: "PAID",
            },
          })

          const anyRiderCommissionRow = await prisma.riderCommission.findFirst({
            where: {
              courierBookingId: courierBookingId,
              riderId: riderId,
              commissionType: "RIDER_COMMISSION",
            },
          })

          const shouldInsertPaidCommission =
            courierBooking.module === "WHOLESALER"
              ? !anyRiderCommissionRow
              : !existingRiderCommission

          if (shouldInsertPaidCommission) {
            try {
              await createRiderCommission({
                module: riderCutModule,
                courierBookingId: courierBookingId,
                riderId: riderId,
                orderAmount: deliveryFee,
                commissionType: CommissionType.RIDER_COMMISSION,
                status: CommissionStatus.PAID,
              })
            } catch (riderCommErr) {
              console.error("createRiderCommission (supplier courier):", riderCommErr)
            }
          }

          await prisma.supplierOrder.update({
            where: { id: supplierOrder.id },
            data: {
              status: "DELIVERED",
              paymentStatus: "PAID",
            },
          })
        } catch (supplierOrderError: unknown) {
          console.error(`Error processing supplier order ${supplierOrder.id}:`, supplierOrderError)
        }
      }

      // Credit the rider their net delivery fare for supplier (pharmacy -> wholesaler) deliveries
      // Net = deliveryFee - rider commission (module WHOLESALER, type RIDER_COMMISSION)
      const riderNetFare = Math.max(0, deliveryFee - riderCutFromDelivery)
      if (riderNetFare > 0) {
        try {
          await ensureRiderDeliveryWalletCompleted({
            riderId,
            amount: riderNetFare,
            courierBookingId,
          })
        } catch (riderPayoutError) {
          console.error("Error crediting rider for supplier delivery:", riderPayoutError)
        }
      }
    }

    /** Parent aggregate orders often have vendorId null; payouts are on child vendor rows. */
    if (updatedOrder && updatedOrder.total) {
      let childOrders: Array<{
        id: string
        vendorId: string | null
        total: number
        subtotal: number
        discount: number
        vendorCommission: number
        deliveryFee: number
      }> = []

      if (!updatedOrder.isChildOrder && !updatedOrder.childId) {
        childOrders = await prisma.order.findMany({
          where: {
            childId: updatedOrder.id,
            isChildOrder: true,
          },
          select: {
            id: true,
            vendorId: true,
            total: true,
            subtotal: true,
            discount: true,
            vendorCommission: true,
            deliveryFee: true,
            module: true,
          },
        })

        if (childOrders.length > 0) {
          const n = childOrders.length
          const weights = childOrders.map((c) => Math.max(0, c.deliveryFee ?? 0))
          const wsum = weights.reduce((a, b) => a + b, 0)
          const splitWeights = wsum > 0 ? weights : childOrders.map(() => 1)
          const commissionParts = splitAmountByWeights(riderCutFromDelivery, splitWeights)

          for (let i = 0; i < childOrders.length; i++) {
            const childOrder = childOrders[i]
            if (!childOrder.vendorId || !childOrder.total) continue

            const childFull = await prisma.order.findUnique({
              where: { id: childOrder.id },
              select: {
                subtotal: true,
                discount: true,
                vendorCommission: true,
                module: true,
              },
            })
            let vendorPayoutChild = 0
            let vendorWalletMeta: Record<string, unknown> | undefined
            if (usesOfferSettlementModule(childFull?.module)) {
              const p = await computeVendorOfferSettlementPayout(childOrder.id)
              vendorPayoutChild = p.vendorPayout
              vendorWalletMeta = {
                vendorSettlementMerchandise: p.settlementMerchandise,
                vendorCommission: p.vendorCommission,
                specialOfferDiscountFunding: p.funding,
                pharmacySettlementMerchandise: p.settlementMerchandise,
                pharmacyVendorCommission: p.vendorCommission,
              }
            } else {
              const disc = childFull?.discount ?? 0
              const vc = childFull?.vendorCommission ?? 0
              const net = Math.max(0, (childFull?.subtotal ?? childOrder.subtotal) - disc)
              vendorPayoutChild = Math.max(0, net - vc)
            }

            const riderShare =
              wsum > 0 ? Math.max(0, childOrder.deliveryFee ?? 0) : deliveryFee / n
            const riderCommissionPart = commissionParts[i] ?? 0
            const netRiderCredit = Math.max(0, riderShare - riderCommissionPart)

            await ensureOrderCompletionPendingWallets({
              orderId: childOrder.id,
              vendorId: childOrder.vendorId,
              riderId,
              riderAmount: netRiderCredit,
              vendorAmount: vendorPayoutChild,
              courierBookingId,
              description: `Order ${childOrder.id} completion`,
              vendorMetadata: vendorWalletMeta,
            })
            await completeOrderWalletTransactions(childOrder.id)
            await markCommissionsAsPaid(childOrder.id)
          }
        }
      }

      const hasChildOrders = childOrders.length > 0
      const paidAnyChildVendor = childOrders.some((c) => Boolean(c.vendorId && c.total))

      const payParentVendor =
        Boolean(updatedOrder.vendorId) && (!hasChildOrders || !paidAnyChildVendor)

      const netRiderSingle = Math.max(0, deliveryFee - riderCutFromDelivery)

      if (payParentVendor) {
        let vendorPayout = 0
        let parentVendorMeta: Record<string, unknown> | undefined
        if (usesOfferSettlementModule(updatedOrder.module)) {
          const p = await computeVendorOfferSettlementPayout(updatedOrder.id)
          vendorPayout = p.vendorPayout
          parentVendorMeta = {
            vendorSettlementMerchandise: p.settlementMerchandise,
            vendorCommission: p.vendorCommission,
            specialOfferDiscountFunding: p.funding,
            pharmacySettlementMerchandise: p.settlementMerchandise,
            pharmacyVendorCommission: p.vendorCommission,
          }
        } else {
          const netParent = Math.max(0, (updatedOrder.subtotal ?? 0) - (updatedOrder.discount ?? 0))
          vendorPayout = Math.max(0, netParent - (updatedOrder.vendorCommission ?? 0))
        }

        await ensureOrderCompletionPendingWallets({
          orderId: updatedOrder.id,
          vendorId: updatedOrder.vendorId,
          riderId,
          riderAmount: netRiderSingle,
          vendorAmount: vendorPayout,
          courierBookingId,
          description: `Order ${updatedOrder.id} completion`,
          vendorMetadata: parentVendorMeta,
        })
        await completeOrderWalletTransactions(updatedOrder.id)
        await markCommissionsAsPaid(updatedOrder.id)
      } else if (
        !payParentVendor &&
        !(hasChildOrders && paidAnyChildVendor) &&
        updatedOrder &&
        riderId &&
        deliveryFee > 0
      ) {
        await ensureOrderCompletionPendingWallets({
          orderId: updatedOrder.id,
          vendorId: updatedOrder.vendorId,
          riderId,
          riderAmount: netRiderSingle,
          vendorAmount: 0,
          courierBookingId,
          description: `Delivery completion order ${updatedOrder.id}`,
        })
        await completeOrderWalletTransactions(updatedOrder.id)
      }
    }
    await prisma.courierBooking.update({
      where: { id: courierBookingId },
      data: {
        paymentStatus: "PAID",
        ...(courierBooking.deliveredAt ? {} : { deliveredAt: new Date() }),
      },
    })
    await markRiderEarningAsPaid(undefined, courierBookingId)
  } catch (commissionError) {
    console.error("Error processing commissions on order completion:", commissionError)
    try {
      await prisma.courierBooking.update({
        where: { id: courierBookingId },
        data: { paymentStatus: "PAID" },
      })
      await markRiderEarningAsPaid(undefined, courierBookingId)
    } catch (e2) {
      console.error("Error in courier completion fallback (payment + rider earning):", e2)
    }
  }
}
