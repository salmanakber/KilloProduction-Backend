import { prisma } from "@/lib/prisma"

/** Margin in DB may be stored as fraction (0.02) or percent (2). */
export function normalizeMarginPercent(margin: number): number {
  if (!Number.isFinite(margin) || margin < 0) return 2
  if (margin > 0 && margin <= 1) return margin * 100
  return margin
}

/**
 * Applies a margin so the sender sees a lower effective rate (platform spread).
 * @param marginPercent e.g. 2 for 2%
 */
export function applyFxMargin(baseRate: number, marginPercent: number): number {
  if (baseRate <= 0) throw new Error("Invalid base rate")
  if (marginPercent < 0) throw new Error("Invalid margin")
  const marginFactor = 1 - marginPercent / 100
  const adjustedRate = baseRate * marginFactor
  return Number(adjustedRate.toFixed(6))
}

async function fetchBaseRateFromProvider(fromCurrency: string, toCurrency: string): Promise<number | null> {
  const config = await prisma.moneyTransferConfig.findFirst()
  const apiKey = config?.exchangeRateApiKey || process.env.EXCHANGE_RATE_API_KEY

  if (!apiKey) {
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`)
    const data = await response.json()
    return data.rates?.[toCurrency] ?? null
  }

  const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/${fromCurrency}`)
  const data = await response.json()
  if (data.result !== "success") return null
  return data.conversion_rates?.[toCurrency] ?? null
}

export async function getMoneyTransferFxRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
  try {
    const config = await prisma.moneyTransferConfig.findFirst()
    const marginRaw = config?.exchangeRateMargin ?? 0.02
    const marginPercent = normalizeMarginPercent(marginRaw)

    const baseRate = await fetchBaseRateFromProvider(fromCurrency, toCurrency)
    if (!baseRate) return null

    return applyFxMargin(baseRate, marginPercent)
  } catch (e) {
    console.error("getMoneyTransferFxRate:", e)
    return null
  }
}

/** Decimal places used to decide if a new rate is “the same” as the last row (avoids float noise duplicates). */
const SNAPSHOT_RATE_DECIMALS = Number(process.env.MONEY_FX_SNAPSHOT_DECIMALS ?? "8")

function normalizeFxPair(fromCurrency: string, toCurrency: string) {
  return {
    from: fromCurrency.trim().toUpperCase(),
    to: toCurrency.trim().toUpperCase(),
  }
}

/** True if `incoming` should be stored as a new row vs `stored` (differs when rounded to snapshot decimals). */
export function fxSnapshotRateIsDistinct(stored: number, incoming: number): boolean {
  if (!Number.isFinite(stored) || !Number.isFinite(incoming)) return true
  return (
    stored.toFixed(SNAPSHOT_RATE_DECIMALS) !== incoming.toFixed(SNAPSHOT_RATE_DECIMALS)
  )
}

/**
 * Records a snapshot only if the rate differs from the latest row for this pair.
 * Replaces the old time-window throttle: duplicate PKR→USD rows happened because (a) mixed-case pairs
 * and (b) tiny float differences vs an overly strict relative epsilon.
 */
export async function maybeRecordFxSnapshot(
  fromCurrency: string,
  toCurrency: string,
  rate: number
): Promise<void> {
  await recordFxSnapshotWhenChanged(fromCurrency, toCurrency, rate)
}

/**
 * Inserts a snapshot only when the rate changed vs the latest DB row (or no row yet).
 * Used by BullMQ worker and mobile API reads.
 */
export async function recordFxSnapshotWhenChanged(
  fromCurrency: string,
  toCurrency: string,
  rate: number
): Promise<"inserted" | "unchanged"> {
  const { from, to } = normalizeFxPair(fromCurrency, toCurrency)
  if (!Number.isFinite(rate) || rate <= 0) return "unchanged"

  const latest = await prisma.moneyFxRateSnapshot.findFirst({
    where: { fromCurrency: from, toCurrency: to },
    orderBy: { createdAt: "desc" },
  })

  if (!latest) {
    await prisma.moneyFxRateSnapshot.create({
      data: { fromCurrency: from, toCurrency: to, rate },
    })
    return "inserted"
  }

  if (!fxSnapshotRateIsDistinct(latest.rate, rate)) {
    return "unchanged"
  }

  await prisma.moneyFxRateSnapshot.create({
    data: { fromCurrency: from, toCurrency: to, rate },
  })
  return "inserted"
}
