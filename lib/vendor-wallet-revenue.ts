import { prisma } from "@/lib/prisma"
import type { Module } from "@prisma/client"

/** Order statuses that count as settled for vendor merchandise credit */
export const SETTLED_ORDER_STATUSES = ["DELIVERED", "COMPLETED"] as const

export function isVendorMerchandiseCredit(tx: {
  metadata: unknown
  reference: string | null
}): boolean {
  const m = tx.metadata as Record<string, unknown> | null
  if (m?.transactionType === "ORDER_PAYMENT") return true
  if (typeof tx.reference === "string" && tx.reference.startsWith("VENDOR-EARN-")) return true
  return false
}

export async function getVendorMerchandiseCredits(params: {
  vendorUserId: string
  module: Module
  pharmacyId?: string | null
}) {
  const raw = await prisma.walletTransaction.findMany({
    where: {
      userId: params.vendorUserId,
      type: "CREDIT",
      status: "COMPLETED",
      orderId: { not: null },
    },
    select: {
      amount: true,
      orderId: true,
      createdAt: true,
      metadata: true,
      reference: true,
    },
  })

  const txs = raw.filter(isVendorMerchandiseCredit)
  const orderIds = [...new Set(txs.map((t) => t.orderId).filter(Boolean))] as string[]
  if (orderIds.length === 0) {
    return { txs: [] as typeof txs, orderById: new Map<string, { id: string; deliveredAt: Date | null; createdAt: Date }>() }
  }

  const orderWhere: Record<string, unknown> = {
    id: { in: orderIds },
    module: params.module,
    status: { in: [...SETTLED_ORDER_STATUSES] },
  }
  if (params.pharmacyId) {
    orderWhere.OR = [{ vendorId: params.vendorUserId }, { pharmacyId: params.pharmacyId }]
  } else {
    orderWhere.vendorId = params.vendorUserId
  }

  const orders = await prisma.order.findMany({
    where: orderWhere as any,
    select: { id: true, deliveredAt: true, createdAt: true },
  })
  const orderById = new Map(orders.map((o) => [o.id, o]))

  const moduleStr = params.module
  const filtered = txs.filter((t) => {
    if (!t.orderId || !orderById.has(t.orderId)) return false
    const m = t.metadata as Record<string, unknown> | null
    if (m?.module != null && String(m.module) !== moduleStr) return false
    return true
  })

  return { txs: filtered, orderById }
}

export function sumCreditsInRange(
  txs: Array<{ amount: unknown; createdAt: Date }>,
  rangeStart: Date,
  rangeEndExclusive: Date,
): number {
  let s = 0
  for (const t of txs) {
    const d = new Date(t.createdAt)
    if (d >= rangeStart && d < rangeEndExclusive) s += Number(t.amount || 0)
  }
  return s
}

export function countDistinctOrdersInRange(
  txs: Array<{ orderId: string | null; createdAt: Date }>,
  rangeStart: Date,
  rangeEndExclusive: Date,
): number {
  const ids = new Set<string>()
  for (const t of txs) {
    if (!t.orderId) continue
    const d = new Date(t.createdAt)
    if (d >= rangeStart && d < rangeEndExclusive) ids.add(t.orderId)
  }
  return ids.size
}
