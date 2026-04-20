import { prisma } from "@/lib/prisma"
import { createOrderCompletionWalletTransactions } from "@/lib/wallet-transaction-service"
import {
  computeVendorOfferSettlementPayout,
  usesOfferSettlementModule,
} from "@/lib/pharmacy-vendor-settlement"

function metaType(metadata: unknown): string | undefined {
  if (metadata && typeof metadata === "object" && "transactionType" in metadata) {
    return String((metadata as { transactionType?: string }).transactionType || "")
  }
  return undefined
}

/**
 * Create PENDING vendor wallet rows (ORDER_PAYMENT) when a courier-linked order is placed.
 * Rider DELIVERY_PAYMENT rows are added on completion via ensureOrderCompletionPendingWallets.
 * Vendor credit = merchandise net (subtotal − discount) − VENDOR_COMMISSION.
 * Customer platform fee (`platformCommission`) is not deducted from the vendor.
 * Idempotent: skips if ORDER_PAYMENT pending already exists for any target order row.
 */
export async function createPendingVendorWalletsForCourierOrder(params: {
  parentOrderId: string
  courierBookingId: string
  orderNumberHint?: string
}): Promise<void> {
  const { parentOrderId, courierBookingId, orderNumberHint } = params

  const parent = await prisma.order.findUnique({
    where: { id: parentOrderId },
    select: {
      id: true,
      orderNumber: true,
      vendorId: true,
      module: true,
      subtotal: true,
      discount: true,
      total: true,
      vendorCommission: true,
      deliveryFee: true,
    },
  })
  if (!parent) return

  const children = await prisma.order.findMany({
    where: { childId: parentOrderId, isChildOrder: true },
    select: {
      id: true,
      vendorId: true,
      module: true,
      subtotal: true,
      discount: true,
      total: true,
      vendorCommission: true,
      deliveryFee: true,
    },
  })

  const targetOrderIds = children.length > 0 ? children.map((c) => c.id) : [parent.id]
  const existingPending = await prisma.walletTransaction.findMany({
    where: { orderId: { in: targetOrderIds }, status: "PENDING" },
  })
  if (existingPending.some((t) => metaType(t.metadata) === "ORDER_PAYMENT")) {
    return
  }

  const label = orderNumberHint || parent.orderNumber

  const addVendorPending = async (row: {
    id: string
    module: string | null
    vendorId: string | null
    subtotal: number
    discount: number | null
    total: number
    vendorCommission: number | null
    deliveryFee: number | null
  }) => {
    if (!row.vendorId) return
    let vendorAmount: number
    if (usesOfferSettlementModule(row.module)) {
      const p = await computeVendorOfferSettlementPayout(row.id)
      vendorAmount = p.vendorPayout
    } else {
      const disc = row.discount ?? 0
      const vc = row.vendorCommission ?? 0
      const net = Math.max(0, row.subtotal - disc)
      vendorAmount = Math.max(0, net - vc)
    }
    if (vendorAmount <= 0) return

    await createOrderCompletionWalletTransactions({
      vendorId: row.vendorId,
      vendorAmount,
      orderId: row.id,
      courierBookingId,
      description: `Payment for order ${label}`,
    })
  }

  if (children.length > 0) {
    for (const c of children) {
      await addVendorPending(c)
    }
  } else {
    await addVendorPending({
      id: parent.id,
      module: parent.module,
      vendorId: parent.vendorId,
      subtotal: parent.subtotal,
      discount: parent.discount,
      total: parent.total,
      vendorCommission: parent.vendorCommission,
      deliveryFee: parent.deliveryFee,
    })
  }
}
