export type PropertyGuestTierLabel = "Standard" | "Platinum" | "VIP"

const TIER_SET = new Set<PropertyGuestTierLabel>(["Standard", "Platinum", "VIP"])

export function normalizePropertyGuestTier(raw?: string | null): PropertyGuestTierLabel {
  const t = String(raw || "Standard").trim()
  if (t.toUpperCase() === "VIP") return "VIP"
  if (t.toUpperCase() === "PLATINUM") return "Platinum"
  return "Standard"
}

export function isValidPropertyGuestTier(raw?: string | null): boolean {
  return TIER_SET.has(normalizePropertyGuestTier(raw))
}
