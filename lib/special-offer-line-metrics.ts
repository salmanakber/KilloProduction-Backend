/**
 * Metrics for a single order line against a special offer.
 * When checkout tags the line with customizations.kiloOfferId === offer.id, the line
 * unit price is already the customer-facing (discounted) price — do not apply theoretical discount again.
 */

export type OfferTerms = {
  id: string
  discountType: string | null
  discountValue: number | null
  discountFundedBy: string | null
}

function asNum(x: unknown): number | null {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN
  return Number.isFinite(n) ? n : null
}

export function metricsForOfferLine(
  offer: OfferTerms,
  item: { quantity: number; unitPrice: number; customizations?: unknown },
) {
  const qty = Number(item.quantity || 0)
  const lineTotal = qty * Number(item.unitPrice || 0)

  const cust = item.customizations as Record<string, unknown> | null | undefined
  const tagged = String(cust?.kiloOfferId || "").trim() === String(offer.id).trim()

  if (tagged) {
    const originalUnit = asNum(cust?.kiloOfferOriginalUnitPrice)
    const fundedBy = String(cust?.kiloOfferDiscountFundedBy || offer.discountFundedBy || "").toUpperCase()
    if (originalUnit != null && originalUnit > 0) {
      const discount = Math.max(0, (originalUnit - Number(item.unitPrice || 0)) * qty)
      return {
        grossSales: lineTotal,
        discountPlatform: fundedBy === "PLATFORM" ? discount : 0,
        discountVendor: fundedBy === "VENDOR" ? discount : 0,
        netVendorMerchandise: Math.max(0, lineTotal - (fundedBy === "VENDOR" ? discount : 0)),
      }
    }
    return {
      grossSales: lineTotal,
      discountPlatform: 0,
      discountVendor: 0,
      netVendorMerchandise: lineTotal,
    }
  }

  let discount = 0
  if (offer.discountType === "PERCENTAGE") {
    discount = lineTotal * (Number(offer.discountValue || 0) / 100)
  } else if (offer.discountType === "FIXED_AMOUNT") {
    discount = Number(offer.discountValue || 0) * qty
  }

  let discountPlatform = 0
  let discountVendor = 0
  if (discount > 0) {
    if (offer.discountFundedBy === "PLATFORM") discountPlatform = discount
    else if (offer.discountFundedBy === "VENDOR") discountVendor = discount
  }

  const netVendorMerchandise = lineTotal - discountVendor

  return {
    grossSales: lineTotal,
    discountPlatform,
    discountVendor,
    netVendorMerchandise,
  }
}
