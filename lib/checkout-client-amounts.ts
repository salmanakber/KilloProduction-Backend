/**
 * Checkout payloads may include `calculatedAmounts` from the app (distance service / cached quote).
 * Use the client-approved `deliveryCharge` when present so the order total matches what the user
 * authorized at payment; otherwise keep the server-computed fee.
 */
export function applyClientDeliveryChargeIfProvided(
  calculatedAmounts: { deliveryCharge?: unknown } | null | undefined,
  serverDeliveryFee: number
): number {
  const raw = calculatedAmounts?.deliveryCharge
  if (raw === undefined || raw === null) return serverDeliveryFee
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw)
  if (!Number.isFinite(n) || n < 0) return serverDeliveryFee
  return Math.round(n * 100) / 100
}
