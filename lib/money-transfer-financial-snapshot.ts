import { prisma } from "@/lib/prisma"
import { applyFxMargin, normalizeMarginPercent } from "@/lib/money-fx-rate"

async function fetchMidMarketRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
  const config = await prisma.moneyTransferConfig.findFirst()
  const apiKey = config?.exchangeRateApiKey || process.env.EXCHANGE_RATE_API_KEY
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()

  if (!apiKey) {
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`)
    const data = await response.json()
    return data.rates?.[to] ?? null
  }

  const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/${from}`)
  const data = await response.json()
  if (data.result !== "success") return null
  return data.conversion_rates?.[to] ?? null
}

/**
 * Locked financial snapshot at transfer creation time — use for admin reporting only from stored columns.
 * Base currency = SystemSettings.currency (e.g. USD).
 */
export async function computeMoneyTransferFinancials(args: {
  sendAmount: number
  sendCurrency: string
  feeInSendCurrency: number
  settlementCurrency?: string
}): Promise<{
  receiveCurrency: string
  receiveAmount: number | null
  baseCurrency: string
  baseAmount: number | null
  midMarketRate: number | null
  customerRate: number | null
  markupPercentage: number | null
  rateSource: string
  fee: number
  feeBase: number | null
  fxMarginSettlement: number | null
  fxMarginBase: number | null
}> {
  const sendAmount = args.sendAmount
  const send = args.sendCurrency.trim().toUpperCase()
  const fee = Math.max(0, args.feeInSendCurrency)
  const settlement = (args.settlementCurrency || "NGN").trim().toUpperCase()

  const [settings, mtConfig] = await Promise.all([
    prisma.systemSettings.findFirst({ select: { currency: true } }),
    prisma.moneyTransferConfig.findFirst(),
  ])

  const baseCurrency = (settings?.currency || "USD").trim().toUpperCase()
  const marginRaw = mtConfig?.exchangeRateMargin ?? 0.02
  const markupPercentage = normalizeMarginPercent(marginRaw)

  const midSendToSettlement = await fetchMidMarketRate(send, settlement)
  const customerRate =
    midSendToSettlement != null
      ? applyFxMargin(midSendToSettlement, markupPercentage)
      : null

  const receiveAmount =
    customerRate != null ? Number((sendAmount * customerRate).toFixed(2)) : null

  let fxMarginSettlement: number | null = null
  if (
    midSendToSettlement != null &&
    customerRate != null &&
    receiveAmount != null
  ) {
    const atMid = sendAmount * midSendToSettlement
    const atCust = sendAmount * customerRate
    fxMarginSettlement = Number(Math.max(0, atMid - atCust).toFixed(2))
  }

  const midSendToBase = await fetchMidMarketRate(send, baseCurrency)
  const baseAmount =
    midSendToBase != null ? Number((sendAmount * midSendToBase).toFixed(6)) : null
  const feeBase =
    midSendToBase != null ? Number((fee * midSendToBase).toFixed(6)) : null

  let fxMarginBase: number | null = null
  if (fxMarginSettlement != null && fxMarginSettlement > 0) {
    const midSettleToBase = await fetchMidMarketRate(settlement, baseCurrency)
    if (midSettleToBase != null) {
      fxMarginBase = Number((fxMarginSettlement * midSettleToBase).toFixed(6))
    }
  }

  const hasApiKey = Boolean(mtConfig?.exchangeRateApiKey || process.env.EXCHANGE_RATE_API_KEY)
  const rateSource = hasApiKey ? "exchangerate-api-v6" : "exchangerate-api-free"

  return {
    receiveCurrency: settlement,
    receiveAmount,
    baseCurrency,
    baseAmount,
    midMarketRate: midSendToSettlement != null ? Number(midSendToSettlement.toFixed(8)) : null,
    customerRate: customerRate != null ? Number(customerRate.toFixed(8)) : null,
    markupPercentage,
    rateSource,
    fee,
    feeBase,
    fxMarginSettlement,
    fxMarginBase,
  }
}
