import type { OfferDiscountFundingSummary } from "@/lib/pharmacy-vendor-settlement"

/**
 * Persisted on `Order.metadata` so vendor apps / admin can see offer context without parsing every line.
 * Built from cart lines (customer app) — same shape as `specialOffer` on `UnifiedCartScreen` items.
 */
export type OrderSpecialOffersMeta = {
  hasSpecialOffers: true
  fundingSummary: OfferDiscountFundingSummary
  lines: Array<{
    productId?: string
    productName?: string
    offerId: string
    module?: string
    discountFundedBy: string
    discountType?: string
    discountValue?: number
    /** List / pre-offer unit price */
    originalUnitPrice?: number
    /** What customer paid per unit */
    customerUnitPrice: number
    quantity: number
  }>
}

function fundingSummaryFromLines(
  lines: OrderSpecialOffersMeta["lines"],
): OfferDiscountFundingSummary {
  let hasP = false
  let hasV = false
  let hasPlain = false
  for (const l of lines) {
    const f = String(l.discountFundedBy || "").toUpperCase()
    if (f === "PLATFORM") hasP = true
    else if (f === "VENDOR") hasV = true
    else hasPlain = true
  }
  if (hasP && hasV) return "MIXED"
  if (hasP) return hasPlain ? "MIXED" : "PLATFORM"
  if (hasV) return hasPlain ? "MIXED" : "VENDOR"
  return "NONE"
}

function parseMaybeJsonObject<T extends Record<string, unknown>>(raw: unknown): T | undefined {
  if (raw == null) return undefined
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown
      if (p && typeof p === "object" && !Array.isArray(p)) return p as T
    } catch {
      return undefined
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as T
  return undefined
}

/** Resolves offer id from various client shapes (mobile cart, API proxies). */
function resolveOfferId(so: Record<string, unknown> | undefined): string | null {
  if (!so) return null
  const id =
    so.offerId ??
    so.id ??
    so.offer_id ??
    (so as { offerID?: unknown }).offerID
  const s = id != null ? String(id).trim() : ""
  return s.length > 0 ? s : null
}

function lineFromKiloCustomizations(it: Record<string, unknown>): OrderSpecialOffersMeta["lines"][0] | null {
  const c = it.customizations as Record<string, unknown> | null | undefined
  const oid = c && String(c.kiloOfferId || "").trim()
  if (!oid) return null
  const orig = c?.kiloOfferOriginalUnitPrice
  const dv = c?.kiloOfferDiscountValue
  return {
    productId: typeof it.productId === "string" ? it.productId : undefined,
    productName: typeof it.name === "string" ? it.name : undefined,
    offerId: oid,
    module: undefined,
    discountFundedBy: String(c?.kiloOfferDiscountFundedBy || ""),
    discountType: c?.kiloOfferDiscountType != null ? String(c.kiloOfferDiscountType) : undefined,
    discountValue: dv != null && Number.isFinite(Number(dv)) ? Number(dv) : undefined,
    originalUnitPrice: orig != null && Number.isFinite(Number(orig)) ? Number(orig) : undefined,
    customerUnitPrice: Number(it.price ?? 0),
    quantity: Math.max(1, Number(it.quantity ?? 1)),
  }
}

function lineFromSaleAttribution(it: Record<string, unknown>): OrderSpecialOffersMeta["lines"][0] | null {
  const sa = parseMaybeJsonObject<Record<string, unknown>>(it.saleAttribution)
  if (!sa) return null
  const src = String(sa.source || "").toUpperCase()
  if (src !== "SPECIAL_OFFER" && src !== "PLATFORM_OFFER") return null
  const oid = sa.offerId != null ? String(sa.offerId).trim() : ""
  if (!oid) return null
  return {
    productId: typeof it.productId === "string" ? it.productId : undefined,
    productName: typeof it.name === "string" ? it.name : undefined,
    offerId: oid,
    module: undefined,
    discountFundedBy: "",
    discountType: undefined,
    discountValue: undefined,
    originalUnitPrice: undefined,
    customerUnitPrice: Number(it.price ?? 0),
    quantity: Math.max(1, Number(it.quantity ?? 1)),
  }
}

/**
 * @param items Cart or checkout payload items: `specialOffer` (UnifiedCartScreen) and/or `customizations.kiloOffer*`.
 */
export function buildOrderSpecialOffersMetadata(
  items: Array<Record<string, unknown>>,
): OrderSpecialOffersMeta | null {
  const lines: OrderSpecialOffersMeta["lines"] = []
  for (const it of items) {
    const itemObj = (it as { itemObject?: unknown }).itemObject
    const nestedOffer =
      itemObj && typeof itemObj === "object" && !Array.isArray(itemObj)
        ? (itemObj as Record<string, unknown>).specialOffer
        : undefined
    const soRaw =
      parseMaybeJsonObject<Record<string, unknown>>(it.specialOffer) ??
      parseMaybeJsonObject<Record<string, unknown>>((it as { special_offer?: unknown }).special_offer) ??
      parseMaybeJsonObject<Record<string, unknown>>(nestedOffer)
    let offerId = resolveOfferId(soRaw)
    if (!offerId) {
      const top =
        (it as { offerId?: unknown }).offerId ??
        (it as { offer_id?: unknown }).offer_id
      if (top != null && String(top).trim()) offerId = String(top).trim()
    }

    if (offerId && soRaw) {
      const orig = soRaw.originalPrice ?? soRaw.original_price
      const dv = soRaw.discountValue ?? soRaw.discount_value
      lines.push({
        productId:
          typeof it.productId === "string"
            ? it.productId
            : typeof it.medicineId === "string"
              ? it.medicineId
              : undefined,
        productName: typeof it.name === "string" ? it.name : undefined,
        offerId,
        module: typeof soRaw.module === "string" ? soRaw.module : undefined,
        discountFundedBy: String(soRaw.discountFundedBy ?? soRaw.discount_funded_by ?? ""),
        discountType:
          soRaw.discountType != null
            ? String(soRaw.discountType)
            : soRaw.discount_type != null
              ? String(soRaw.discount_type)
              : undefined,
        discountValue:
          dv != null && Number.isFinite(Number(dv)) ? Number(dv) : undefined,
        originalUnitPrice:
          orig != null && Number.isFinite(Number(orig)) ? Number(orig) : undefined,
        customerUnitPrice: Number(it.price ?? 0),
        quantity: Math.max(1, Number(it.quantity ?? 1)),
      })
      continue
    }

    /** Line has offer id on item root but no specialOffer object (some clients). */
    if (offerId && !soRaw) {
      lines.push({
        productId:
          typeof it.productId === "string"
            ? it.productId
            : typeof (it as { medicineId?: string }).medicineId === "string"
              ? (it as { medicineId: string }).medicineId
              : undefined,
        productName: typeof it.name === "string" ? it.name : undefined,
        offerId,
        module: typeof it.module === "string" ? it.module : undefined,
        discountFundedBy: "",
        discountType: undefined,
        discountValue: undefined,
        originalUnitPrice: undefined,
        customerUnitPrice: Number(it.price ?? 0),
        quantity: Math.max(1, Number(it.quantity ?? 1)),
      })
      continue
    }

    const fromSale = lineFromSaleAttribution(it)
    if (fromSale) {
      lines.push(fromSale)
      continue
    }

    const fromCust = lineFromKiloCustomizations(it)
    if (fromCust) lines.push(fromCust)
  }
  if (lines.length === 0) return null
  return {
    hasSpecialOffers: true,
    fundingSummary: fundingSummaryFromLines(lines),
    lines,
  }
}

export function mergeOrderMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {}
  return { ...base, ...patch }
}
