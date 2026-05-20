import { prisma } from "@/lib/prisma"
import {
  applyFxMargin,
  assertPlausibleConversion,
  getMoneyTransferMidMarketRate,
  normalizeMarginPercent,
} from "@/lib/money-fx-rate"

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
  const hasApiKey = Boolean(mtConfig?.exchangeRateApiKey || process.env.EXCHANGE_RATE_API_KEY)
  const rateSource = hasApiKey ? "exchangerate-api-v6" : "exchangerate-api-free"

  if (send === settlement) {
    const midSendToBase = await getMoneyTransferMidMarketRate(send, baseCurrency)
    const baseAmount =
      midSendToBase != null ? Number((sendAmount * midSendToBase).toFixed(6)) : null
    const feeBase =
      midSendToBase != null ? Number((fee * midSendToBase).toFixed(6)) : null
    return {
      receiveCurrency: settlement,
      receiveAmount: Number(sendAmount.toFixed(2)),
      baseCurrency,
      baseAmount,
      midMarketRate: 1,
      customerRate: 1,
      markupPercentage,
      rateSource,
      fee,
      feeBase,
      fxMarginSettlement: 0,
      fxMarginBase: 0,
    }
  }

  const midSendToSettlement = await getMoneyTransferMidMarketRate(send, settlement)
  const customerRate =
    midSendToSettlement != null
      ? applyFxMargin(midSendToSettlement, markupPercentage)
      : null

  const receiveAmount =
    customerRate != null ? Number((sendAmount * customerRate).toFixed(2)) : null

  if (receiveAmount != null) {
    assertPlausibleConversion(sendAmount, send, receiveAmount, settlement)
  }

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

  const midSendToBase = await getMoneyTransferMidMarketRate(send, baseCurrency)
  const baseAmount =
    midSendToBase != null ? Number((sendAmount * midSendToBase).toFixed(6)) : null
  const feeBase =
    midSendToBase != null ? Number((fee * midSendToBase).toFixed(6)) : null

  let fxMarginBase: number | null = null
  if (fxMarginSettlement != null && fxMarginSettlement > 0) {
    const midSettleToBase = await getMoneyTransferMidMarketRate(settlement, baseCurrency)
    if (midSettleToBase != null) {
      fxMarginBase = Number((fxMarginSettlement * midSettleToBase).toFixed(6))
    }
  }

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
