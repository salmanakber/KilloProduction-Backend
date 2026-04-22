type OfferLine = {
  module?: string
  productId?: string
  offerId?: string
  quantity?: number
  discountFundedBy?: string
  customerUnitPrice?: number
  originalUnitPrice?: number
}

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function norm(v: unknown): string {
  return String(v ?? "").trim().toUpperCase()
}

function readSpecialOfferLines(orderMeta: unknown): OfferLine[] {
  if (!orderMeta || typeof orderMeta !== "object" || Array.isArray(orderMeta)) return []
  const specialOffers = (orderMeta as { specialOffers?: unknown }).specialOffers
  if (!specialOffers || typeof specialOffers !== "object" || Array.isArray(specialOffers)) return []
  const lines = (specialOffers as { lines?: unknown }).lines
  if (!Array.isArray(lines)) return []
  return lines.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as OfferLine[]
}

/**
 * Platform-funded discount amount that should be added back to vendor-visible revenue.
 * Vendor-funded discounts are intentionally ignored (vendor absorbs them).
 */
export function platformFundedDeltaForOrder(
  orderMeta: unknown,
  module: string,
  opts?: { productId?: string; offerId?: string },
): number {
  const lines = readSpecialOfferLines(orderMeta)
  let sum = 0
  for (const l of lines) {
    if (norm(l.module) && norm(l.module) !== norm(module)) continue
    if (opts?.productId && String(l.productId ?? "") !== String(opts.productId)) continue
    if (opts?.offerId && String(l.offerId ?? "") !== String(opts.offerId)) continue
    if (norm(l.discountFundedBy) !== "PLATFORM") continue

    const qty = toNum(l.quantity) ?? 0
    const customerUnit = toNum(l.customerUnitPrice)
    const originalUnit = toNum(l.originalUnitPrice)
    if (qty <= 0 || customerUnit == null || originalUnit == null) continue
    sum += Math.max(0, (originalUnit - customerUnit) * qty)
  }
  return Math.round(sum * 100) / 100
}
