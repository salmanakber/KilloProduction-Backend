import { prisma } from "@/lib/prisma"
import type { Module } from "@prisma/client"

/** Split `total` across buckets proportionally to `weights`; last bucket absorbs rounding remainder. */
export function splitAmountByWeights(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!Number.isFinite(total) || total <= 0) return weights.map(() => 0)
  if (sum <= 0) return weights.map(() => 0)
  const out: number[] = []
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    if (i === weights.length - 1) {
      out.push(Math.round((total - acc) * 100) / 100)
    } else {
      const part = Math.round((weights[i] / sum) * total * 100) / 100
      out.push(part)
      acc += part
    }
  }
  return out
}

/**
 * Persists one VENDOR_COMMISSION row per vendor order (parent or child) from `order.vendorCommission`.
 * Customer PLATFORM_FEE lives on `order.platformCommission` only — it is not deducted from vendors.
 * Idempotent per orderId + VENDOR_COMMISSION.
 */
export async function ensureVendorCommissionRecordsForOrderTree(parentOrderId: string): Promise<void> {
  const children = await prisma.order.findMany({
    where: { childId: parentOrderId, isChildOrder: true },
    select: {
      id: true,
      vendorId: true,
      module: true,
      subtotal: true,
      discount: true,
      vendorCommission: true,
    },
  })

  const targets =
    children.length > 0
      ? children
      : await prisma.order.findMany({
          where: { id: parentOrderId },
          select: {
            id: true,
            vendorId: true,
            module: true,
            subtotal: true,
            discount: true,
            vendorCommission: true,
          },
        })

  for (const row of targets) {
    if (!row.vendorId) continue
    const vc = row.vendorCommission ?? 0
    if (vc <= 0) continue

    const existing = await prisma.vendorCommission.findFirst({
      where: {
        orderId: row.id,
        commissionType: "VENDOR_COMMISSION",
      },
    })
    if (existing) continue

    const orderAmount = Math.max(0, row.subtotal - (row.discount ?? 0))
    const ratePct = orderAmount > 0 ? (vc / orderAmount) * 100 : 0

    await prisma.vendorCommission.create({
      data: {
        vendorId: row.vendorId,
        orderId: row.id,
        module: (row.module || "GROCERY") as Module,
        commissionType: "VENDOR_COMMISSION",
        orderAmount,
        commissionRate: Math.round(ratePct * 10000) / 10000,
        commissionAmount: vc,
        status: "PENDING",
      },
    })
  }
}

/**
 * Customer platform fee stored as VendorCommission (PLATFORM_FEE) for reporting only — not a vendor charge.
 * Uses order line `platformCommission` + `vendorId` for attribution. Idempotent per orderId + PLATFORM_FEE.
 */
export async function ensurePlatformFeeReportingVendorCommissions(
  parentOrderId: string
): Promise<void> {
  const children = await prisma.order.findMany({
    where: { childId: parentOrderId, isChildOrder: true },
    select: {
      id: true,
      vendorId: true,
      module: true,
      subtotal: true,
      discount: true,
      platformCommission: true,
    },
  })

  const targets =
    children.length > 0
      ? children
      : await prisma.order.findMany({
          where: { id: parentOrderId },
          select: {
            id: true,
            vendorId: true,
            module: true,
            subtotal: true,
            discount: true,
            platformCommission: true,
          },
        })

  for (const row of targets) {
    if (!row.vendorId) continue
    const pc = row.platformCommission ?? 0
    if (pc <= 0) continue

    const existing = await prisma.vendorCommission.findFirst({
      where: {
        orderId: row.id,
        commissionType: "PLATFORM_FEE",
      },
    })
    if (existing) continue

    const orderAmount = Math.max(0, row.subtotal - (row.discount ?? 0))
    const ratePct = orderAmount > 0 ? (pc / orderAmount) * 100 : 0

    await prisma.vendorCommission.create({
      data: {
        vendorId: row.vendorId,
        orderId: row.id,
        module: (row.module || "GROCERY") as Module,
        commissionType: "PLATFORM_FEE",
        orderAmount,
        commissionRate: Math.round(ratePct * 10000) / 10000,
        commissionAmount: pc,
        status: "PENDING",
      },
    })
  }
}
