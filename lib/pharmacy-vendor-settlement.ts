import { prisma } from "@/lib/prisma"

/** Modules where special-offer lines use `kiloOffer*` customizations for wallet + commission settlement. */
export const OFFER_SETTLEMENT_MODULES = ["PHARMACY", "FOOD", "GROCERY", "AUTO_PARTS"] as const

export type OfferSettlementModule = (typeof OFFER_SETTLEMENT_MODULES)[number]

export function usesOfferSettlementModule(module: string | null | undefined): boolean {
  const m = String(module || "").toUpperCase()
  return (OFFER_SETTLEMENT_MODULES as readonly string[]).includes(m)
}

export type OfferDiscountFundingSummary = "PLATFORM" | "VENDOR" | "NONE" | "MIXED"

/**
 * How special-offer lines fund discounts (for wallet / reporting metadata).
 */
export function summarizeOfferFundingFromItems(
  items: Array<{ customizations: unknown }>,
): OfferDiscountFundingSummary {
  let hasP = false
  let hasV = false
  let hasPlain = false
  for (const li of items) {
    const c = li.customizations as Record<string, unknown> | null | undefined
    if (!c || !String(c.kiloOfferId || "").trim()) {
      hasPlain = true
      continue
    }
    const f = String(c.kiloOfferDiscountFundedBy || "").toUpperCase()
    if (f === "PLATFORM") hasP = true
    else if (f === "VENDOR") hasV = true
    else hasPlain = true
  }
  if (hasP && hasV) return "MIXED"
  if (hasP) return hasPlain ? "MIXED" : "PLATFORM"
  if (hasV) return hasPlain ? "MIXED" : "VENDOR"
  return "NONE"
}

/**
 * Merchandise base before subtracting order.vendorCommission:
 * platform-funded offer lines use list unit (kiloOfferOriginalUnitPrice); others use paid unitPrice.
 */
export function rawVendorMerchandiseBaseFromOrderItems(
  items: Array<{ customizations: unknown; quantity: number; unitPrice: unknown }>,
): number {
  let base = 0
  for (const li of items) {
    const qty = Number(li.quantity || 0)
    const unit = Number(li.unitPrice || 0)
    const c = li.customizations as Record<string, unknown> | null | undefined
    const orig = Number(c?.kiloOfferOriginalUnitPrice ?? 0)
    const funded = String(c?.kiloOfferDiscountFundedBy ?? "").toUpperCase()
    const hasOffer = String(c?.kiloOfferId ?? "").trim().length > 0
    if (hasOffer && funded === "PLATFORM" && orig > 0) {
      base += orig * qty
    } else {
      base += unit * qty
    }
  }
  return Math.round(base * 100) / 100
}

/** Same promo scaling as checkout: (subtotal - promo) / subtotal */
export function scaleMerchandiseBaseWithOrderPromo(
  rawMerchandiseBase: number,
  orderSubtotal: number,
  orderDiscount: number,
): number {
  const sub = Math.max(0, Number(orderSubtotal || 0))
  const disc = Math.max(0, Number(orderDiscount || 0))
  if (sub <= 0) return Math.max(0, rawMerchandiseBase - disc)
  const scale = Math.max(0, sub - disc) / sub
  return Math.round(rawMerchandiseBase * scale * 100) / 100
}

/**
 * Merchandise value for vendor settlement:
 * - PLATFORM-funded offer lines: full list (original unit × qty). Order-level promo does not erode list booking.
 * - VENDOR-funded / normal lines: customer-paid line totals scaled by order promo (same as before).
 */
export function settlementMerchandiseFromOrderItems(
  items: Array<{ customizations: unknown; quantity: number; unitPrice: unknown }>,
  orderSubtotal: number,
  orderDiscount: number,
): number {
  const sub = Math.max(0, Number(orderSubtotal || 0))
  const disc = Math.max(0, Number(orderDiscount || 0))
  const scale = sub <= 0 ? 1 : Math.max(0, sub - disc) / sub

  let total = 0
  for (const li of items) {
    const qty = Number(li.quantity || 0)
    const unit = Number(li.unitPrice || 0)
    const c = li.customizations as Record<string, unknown> | null | undefined
    const orig = Number(c?.kiloOfferOriginalUnitPrice ?? 0)
    const funded = String(c?.kiloOfferDiscountFundedBy ?? "").toUpperCase()
    const hasOffer = String(c?.kiloOfferId ?? "").trim().length > 0
    if (hasOffer && funded === "PLATFORM" && orig > 0) {
      total += orig * qty
    } else {
      total += unit * qty * scale
    }
  }
  return Math.round(total * 100) / 100
}

/**
 * Merchandise base for vendor commission at checkout (cart lines before order exists).
 * Supports `specialOffer` (pharmacy-style) and `customizations.kiloOffer*` (food/grocery/auto-parts).
 */
export function rawVendorMerchandiseBaseFromCartLines(
  lines: Array<{
    quantity?: unknown
    price?: unknown
    specialOffer?: { discountFundedBy?: string; originalPrice?: number; offerId?: string }
    customizations?: unknown
  }>,
): number {
  let base = 0
  for (const line of lines) {
    const qty = Number(line.quantity || 0)
    const paid = Number(line.price || 0)
    const so = line.specialOffer
    const c = line.customizations as Record<string, unknown> | null | undefined
    const hasOfferC = String(c?.kiloOfferId ?? "").trim().length > 0
    const fundedC = String(c?.kiloOfferDiscountFundedBy ?? "").toUpperCase()
    const origC = Number(c?.kiloOfferOriginalUnitPrice ?? 0)

    if (
      so &&
      String(so.discountFundedBy || "").toUpperCase() === "PLATFORM" &&
      so.originalPrice != null &&
      Number.isFinite(Number(so.originalPrice))
    ) {
      base += Number(so.originalPrice) * qty
    } else if (hasOfferC && fundedC === "PLATFORM" && origC > 0) {
      base += origC * qty
    } else {
      base += paid * qty
    }
  }
  return Math.round(base * 100) / 100
}

/**
 * Same rules as {@link settlementMerchandiseFromOrderItems} for cart lines at checkout
 * (`price` = unit paid, `orderDiscount` = order-level promo amount).
 */
export function settlementMerchandiseFromCartLines(
  lines: Array<{
    quantity?: unknown
    price?: unknown
    specialOffer?: { discountFundedBy?: string; originalPrice?: number; offerId?: string }
    customizations?: unknown
  }>,
  orderSubtotal: number,
  orderDiscount: number,
): number {
  const sub = Math.max(0, Number(orderSubtotal || 0))
  const disc = Math.max(0, Number(orderDiscount || 0))
  const scale = sub <= 0 ? 1 : Math.max(0, sub - disc) / sub

  let total = 0
  for (const line of lines) {
    const qty = Number(line.quantity || 0)
    const paid = Number(line.price || 0)
    const so = line.specialOffer
    const c = line.customizations as Record<string, unknown> | null | undefined
    const hasOfferC = String(c?.kiloOfferId ?? "").trim().length > 0
    const fundedC = String(c?.kiloOfferDiscountFundedBy ?? "").toUpperCase()
    const origC = Number(c?.kiloOfferOriginalUnitPrice ?? 0)

    if (
      so &&
      String(so.discountFundedBy || "").toUpperCase() === "PLATFORM" &&
      so.originalPrice != null &&
      Number.isFinite(Number(so.originalPrice))
    ) {
      total += Number(so.originalPrice) * qty
    } else if (hasOfferC && fundedC === "PLATFORM" && origC > 0) {
      total += origC * qty
    } else {
      total += paid * qty * scale
    }
  }
  return Math.round(total * 100) / 100
}

/**
 * Vendor payout for orders whose lines may carry special-offer funding metadata (all marketplace modules).
 * Alias kept for existing imports.
 */
export async function computeVendorOfferSettlementPayout(orderId: string): Promise<{
  vendorPayout: number
  settlementMerchandise: number
  vendorCommission: number
  funding: OfferDiscountFundingSummary
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      subtotal: true,
      discount: true,
      vendorCommission: true,
      orderItems: { select: { customizations: true, quantity: true, unitPrice: true } },
    },
  })
  if (!order) {
    return { vendorPayout: 0, settlementMerchandise: 0, vendorCommission: 0, funding: "NONE" }
  }
  const settlement = settlementMerchandiseFromOrderItems(
    order.orderItems,
    Number(order.subtotal || 0),
    Number(order.discount || 0),
  )
  const vc = Number(order.vendorCommission || 0)
  const payout = Math.max(0, settlement - vc)
  return {
    vendorPayout: Math.round(payout * 100) / 100,
    settlementMerchandise: settlement,
    vendorCommission: vc,
    funding: summarizeOfferFundingFromItems(order.orderItems),
  }
}

/** @deprecated Use computeVendorOfferSettlementPayout — same implementation, name was pharmacy-specific. */
export const computePharmacyVendorPayout = computeVendorOfferSettlementPayout
