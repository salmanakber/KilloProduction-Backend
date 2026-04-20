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

function idsMatchLineOffer(a: unknown, b: unknown): boolean {
  const x = String(a ?? "").trim().toLowerCase()
  const y = String(b ?? "").trim().toLowerCase()
  return x.length > 0 && y.length > 0 && x === y
}

/**
 * For "X% off list" offers: customer paid = list * (1 - p). Platform/vendor subsidy = paid * p / (1 - p).
 * (Avoid applying p to the discounted price — that understates the subsidy, e.g. 15% of 170 ≈ 26 vs gap 30.)
 */
function percentageOffListSubsidy(customerLineTotal: number, percentOffList: number): number {
  const p = Math.max(0, Math.min(0.9999, percentOffList / 100))
  if (p <= 0 || customerLineTotal <= 0) return 0
  const denom = 1 - p
  if (denom <= 0) return 0
  return Math.round(customerLineTotal * (p / denom) * 100) / 100
}

export function metricsForOfferLine(
  offer: OfferTerms,
  item: { quantity: number; unitPrice: number; customizations?: unknown },
) {
  const qty = Number(item.quantity || 0)
  const lineTotal = qty * Number(item.unitPrice || 0)

  const cust = item.customizations as Record<string, unknown> | null | undefined
  const tagged = idsMatchLineOffer(cust?.kiloOfferId, offer.id)

  if (tagged) {
    const originalUnit = asNum(cust?.kiloOfferOriginalUnitPrice)
    const fundedBy = String(cust?.kiloOfferDiscountFundedBy || offer.discountFundedBy || "").toUpperCase()
    if (originalUnit != null && originalUnit > 0) {
      const unitPrice = Number(item.unitPrice || 0)
      const discount = Math.max(0, (originalUnit - unitPrice) * qty)
      // Customer line total is always what they paid (discounted unit × qty)
      const customerLineTotal = qty * unitPrice
      if (fundedBy === "PLATFORM") {
        return {
          grossSales: customerLineTotal,
          discountPlatform: discount,
          discountVendor: 0,
          // Vendor settles as full list price; platform funds the gap (discount)
          netVendorMerchandise: originalUnit * qty,
        }
      }
      // VENDOR-funded: vendor nets what the customer paid; they absorb the discount vs list
      return {
        grossSales: customerLineTotal,
        discountPlatform: 0,
        discountVendor: discount,
        netVendorMerchandise: customerLineTotal,
      }
    }
    // Tagged to offer but list price missing on line: infer % off list from offer + customer paid
    if (offer.discountType === "PERCENTAGE" && Number(offer.discountValue || 0) > 0) {
      const pct = Number(offer.discountValue || 0)
      const subsidy = percentageOffListSubsidy(lineTotal, pct)
      const fundedBy = String(cust?.kiloOfferDiscountFundedBy || offer.discountFundedBy || "").toUpperCase()
      if (fundedBy === "PLATFORM") {
        return {
          grossSales: lineTotal,
          discountPlatform: subsidy,
          discountVendor: 0,
          netVendorMerchandise: lineTotal + subsidy,
        }
      }
      if (fundedBy === "VENDOR") {
        return {
          grossSales: lineTotal,
          discountPlatform: 0,
          discountVendor: subsidy,
          netVendorMerchandise: lineTotal,
        }
      }
    }
    return {
      grossSales: lineTotal,
      discountPlatform: 0,
      discountVendor: 0,
      netVendorMerchandise: lineTotal,
    }
  }

  /** No line tags: infer subsidy from offer terms + what customer paid (still on the line). */
  let discountPlatform = 0
  let discountVendor = 0
  let grossSales = lineTotal
  const pct = Number(offer.discountValue || 0)

  if (offer.discountType === "PERCENTAGE" && pct > 0) {
    const subsidy = percentageOffListSubsidy(lineTotal, pct)
    if (offer.discountFundedBy === "PLATFORM") {
      discountPlatform = subsidy
      grossSales = lineTotal
      return {
        grossSales,
        discountPlatform,
        discountVendor: 0,
        netVendorMerchandise: lineTotal + subsidy,
      }
    }
    if (offer.discountFundedBy === "VENDOR") {
      discountVendor = subsidy
      return {
        grossSales: lineTotal,
        discountPlatform: 0,
        discountVendor,
        netVendorMerchandise: lineTotal,
      }
    }
  }

  let discount = 0
  if (offer.discountType === "PERCENTAGE") {
    discount = lineTotal * (Number(offer.discountValue || 0) / 100)
  } else if (offer.discountType === "FIXED_AMOUNT") {
    discount = Number(offer.discountValue || 0) * qty
  }

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
