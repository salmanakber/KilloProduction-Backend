import { prisma } from "@/lib/prisma"
import { assertPlausibleConversion, getMoneyTransferFxRate } from "@/lib/money-fx-rate"

export type WalletWithdrawalQuote = {
  walletAmount: number
  walletCurrency: string
  payoutCurrency: string
  feePercentage: number
  feeFixed: number
  feeInWalletCurrency: number
  exchangeRate: number
  grossPayoutAmount: number
  payoutAmount: number
  requiresConversion: boolean
}

export async function computeWalletWithdrawalQuote(args: {
  walletAmount: number
  walletCurrency: string
  payoutCurrency: string
}): Promise<WalletWithdrawalQuote> {
  const walletAmount = args.walletAmount
  if (walletAmount <= 0) throw new Error("Invalid withdrawal amount")

  const walletCurrency = args.walletCurrency.trim().toUpperCase().slice(0, 3)
  const payoutCurrency = args.payoutCurrency.trim().toUpperCase().slice(0, 3)
  const requiresConversion = walletCurrency !== payoutCurrency

  const config = await prisma.moneyTransferConfig.findFirst({
    select: { transferFeePercentage: true, transferFeeFixed: true },
  })
  const feePercentage = config?.transferFeePercentage ?? 0
  const feeFixed = config?.transferFeeFixed ?? 0
  const feeInWalletCurrency =
    Math.round(((walletAmount * feePercentage) / 100 + feeFixed) * 100) / 100

  const netForPayout = Math.max(0, walletAmount - feeInWalletCurrency)

  let exchangeRate = 1
  if (requiresConversion) {
    const rate = await getMoneyTransferFxRate(walletCurrency, payoutCurrency)
    if (!rate) throw new Error("Exchange rate unavailable. Try again later.")
    exchangeRate = rate
  }

  const grossPayoutAmount = Number((netForPayout * exchangeRate).toFixed(2))
  const payoutAmount = grossPayoutAmount

  if (payoutAmount <= 0) {
    throw new Error("Amount is too small after fees and conversion")
  }

  if (requiresConversion) {
    assertPlausibleConversion(netForPayout, walletCurrency, payoutAmount, payoutCurrency)
  }

  return {
    walletAmount,
    walletCurrency,
    payoutCurrency,
    feePercentage,
    feeFixed,
    feeInWalletCurrency,
    exchangeRate,
    grossPayoutAmount,
    payoutAmount,
    requiresConversion,
  }
}
