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

const STRONG_CURRENCIES = new Set([
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "SGD",
  "HKD",
])

/**
 * Fix API responses that return the inverse pair (e.g. PKR→USD as 4+ instead of ~0.0035).
 */
export function correctFxRateDirection(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): number {
  if (!Number.isFinite(rate) || rate <= 0) return rate
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  if (from === to) return 1

  const fromStrong = STRONG_CURRENCIES.has(from)
  const toStrong = STRONG_CURRENCIES.has(to)

  if (!fromStrong && toStrong && rate >= 1) {
    return Number((1 / rate).toFixed(8))
  }
  if (fromStrong && !toStrong && rate < 1) {
    return Number((1 / rate).toFixed(8))
  }
  return rate
}

async function getMoneyTransferConfigSafe(): Promise<{
  exchangeRateApiKey?: string | null
  exchangeRateMargin?: number | null
} | null> {
  try {
    return await prisma.moneyTransferConfig.findFirst({
      select: {
        exchangeRateApiKey: true,
        exchangeRateMargin: true,
      },
    })
  } catch (e) {
    console.warn("getMoneyTransferConfigSafe:", e)
    return null
  }
}

async function getExchangeApiKeySafe(): Promise<string | undefined> {
  const config = await getMoneyTransferConfigSafe()
  const key = config?.exchangeRateApiKey || process.env.EXCHANGE_RATE_API_KEY
  return key || undefined
}

async function fetchRateWithBase(base: string, quote: string): Promise<number | null> {
  const apiKey = await getExchangeApiKeySafe()

  const tryFree = async (): Promise<number | null> => {
    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${base}`)
      if (!response.ok) return null
      const data = await response.json()
      const r = data?.rates?.[quote]
      return typeof r === "number" && r > 0 ? r : null
    } catch {
      return null
    }
  }

  if (!apiKey) return tryFree()

  try {
    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${base}`,
    )
    if (!response.ok) return tryFree()
    const data = await response.json()
    if (data.result !== "success") return tryFree()
    const r = data.conversion_rates?.[quote]
    return typeof r === "number" && r > 0 ? r : null
  } catch {
    return tryFree()
  }
}

async function fetchBaseRateFromProvider(
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  if (from === to) return 1

  let rate = await fetchRateWithBase(from, to)
  if (rate == null) {
    const inverse = await fetchRateWithBase(to, from)
    if (inverse != null && inverse > 0) {
      rate = 1 / inverse
    }
  }
  if (rate == null) return null

  return correctFxRateDirection(from, to, rate)
}

/** Mid-market rate (no margin) for locking transfer snapshots. */
export async function getMoneyTransferMidMarketRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  return fetchBaseRateFromProvider(fromCurrency, toCurrency)
}

export async function getMoneyTransferFxRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  try {
    if (fromCurrency.trim().toUpperCase() === toCurrency.trim().toUpperCase()) {
      return 1
    }
    const config = await getMoneyTransferConfigSafe()
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

/** Reject impossible conversions before money moves (e.g. 100k PKR → 441k USD). */
export function assertPlausibleConversion(
  sendAmount: number,
  sendCurrency: string,
  receiveAmount: number,
  receiveCurrency: string,
): void {
  if (!Number.isFinite(sendAmount) || sendAmount <= 0) {
    throw new Error("Invalid send amount")
  }
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("Invalid receive amount")
  }

  const send = sendCurrency.trim().toUpperCase()
  const recv = receiveCurrency.trim().toUpperCase()

  if (send === recv) {
    const tolerance = Math.max(0.02, sendAmount * 0.001)
    if (Math.abs(receiveAmount - sendAmount) > tolerance) {
      throw new Error("Receive amount does not match send amount for same currency")
    }
    return
  }

  const sendStrong = STRONG_CURRENCIES.has(send)
  const recvStrong = STRONG_CURRENCIES.has(recv)

  if (!sendStrong && recvStrong && receiveAmount >= sendAmount * 0.5) {
    throw new Error(
      `Conversion rejected: ${sendAmount} ${send} to ${receiveAmount} ${recv} is not plausible`,
    )
  }
  if (sendStrong && !recvStrong && receiveAmount <= sendAmount) {
    throw new Error(
      `Conversion rejected: ${sendAmount} ${send} to ${receiveAmount} ${recv} is not plausible`,
    )
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

export async function maybeRecordFxSnapshot(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): Promise<void> {
  await recordFxSnapshotWhenChanged(fromCurrency, toCurrency, rate)
}

export async function recordFxSnapshotWhenChanged(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): Promise<"inserted" | "unchanged"> {
  try {
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
  } catch (e) {
    console.warn("recordFxSnapshotWhenChanged:", e)
    return "unchanged"
  }
}
