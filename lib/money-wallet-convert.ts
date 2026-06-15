import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { assertPlausibleConversion, getMoneyTransferFxRate } from "@/lib/money-fx-rate"

export type WalletConvertQuote = {
  fromAmount: number
  fromCurrency: string
  toAmount: number
  toCurrency: string
  feePercentage: number
  feeFixed: number
  feeInFromCurrency: number
  netFromAmount: number
  exchangeRate: number
  requiresConversion: boolean
}

export async function computeWalletConvertQuote(args: {
  fromAmount: number
  fromCurrency: string
  toCurrency: string
}): Promise<WalletConvertQuote> {
  const fromAmount = args.fromAmount
  if (fromAmount <= 0) throw new Error("Invalid conversion amount")

  const fromCurrency = args.fromCurrency.trim().toUpperCase().slice(0, 3)
  const toCurrency = args.toCurrency.trim().toUpperCase().slice(0, 3)

  if (fromCurrency === toCurrency) {
    throw new Error("Choose two different wallet currencies")
  }

  const config = await prisma.moneyTransferConfig.findFirst({
    select: { transferFeePercentage: true, transferFeeFixed: true },
  })
  const feePercentage = config?.transferFeePercentage ?? 0
  const feeFixed = config?.transferFeeFixed ?? 0
  const feeInFromCurrency =
    Math.round(((fromAmount * feePercentage) / 100 + feeFixed) * 100) / 100

  const netFromAmount = Math.max(0, fromAmount - feeInFromCurrency)

  const rate = await getMoneyTransferFxRate(fromCurrency, toCurrency)
  if (!rate) throw new Error("Exchange rate unavailable. Try again later.")

  const toAmount = Number((netFromAmount * rate).toFixed(2))
  if (toAmount <= 0) {
    throw new Error("Amount is too small after fees and conversion")
  }

  assertPlausibleConversion(netFromAmount, fromCurrency, toAmount, toCurrency)

  return {
    fromAmount,
    fromCurrency,
    toAmount,
    toCurrency,
    feePercentage,
    feeFixed,
    feeInFromCurrency,
    netFromAmount,
    exchangeRate: rate,
    requiresConversion: true,
  }
}

function normalizeCurrency(currency: string) {
  return currency.trim().toUpperCase().slice(0, 3)
}

async function getOrCreateWalletTx(
  tx: Prisma.TransactionClient,
  userId: string,
  currency: string,
) {
  const c = normalizeCurrency(currency)
  const existing = await tx.moneyTransferWallet.findUnique({
    where: { userId_currency: { userId, currency: c } },
  })
  if (existing) return existing
  return tx.moneyTransferWallet.create({
    data: { userId, currency: c, balance: 0 },
  })
}

export async function executeWalletConvert(args: {
  userId: string
  fromCurrency: string
  toCurrency: string
  fromAmount: number
  expectedToAmount?: number
}) {
  const fromCurrency = normalizeCurrency(args.fromCurrency)
  const toCurrency = normalizeCurrency(args.toCurrency)
  const fromAmount = args.fromAmount

  if (fromAmount <= 0) throw new Error("Invalid conversion amount")
  if (fromCurrency === toCurrency) throw new Error("Choose two different wallet currencies")

  const quote = await computeWalletConvertQuote({
    fromAmount,
    fromCurrency,
    toCurrency,
  })

  if (args.expectedToAmount != null) {
    const expected = Number(args.expectedToAmount)
    if (!Number.isFinite(expected) || Math.abs(expected - quote.toAmount) > 0.02) {
      throw new Error("Conversion quote changed. Refresh and try again.")
    }
  }

  const pairRef = `MTW_CV_${Date.now()}_${args.userId.slice(0, 6)}`

  return prisma.$transaction(async (tx) => {
    const sourceWallet = await tx.moneyTransferWallet.findUnique({
      where: { userId_currency: { userId: args.userId, currency: fromCurrency } },
    })
    if (!sourceWallet) {
      throw new Error(`No ${fromCurrency} wallet found`)
    }
    if (sourceWallet.balance < fromAmount) {
      throw new Error("Insufficient wallet balance")
    }

    const destWallet = await getOrCreateWalletTx(tx, args.userId, toCurrency)

    const sourceBalanceAfter = sourceWallet.balance - fromAmount
    const destBalanceAfter = destWallet.balance + quote.toAmount

    const sharedMeta = {
      convertPairRef: pairRef,
      fromCurrency,
      toCurrency,
      fromAmount,
      toAmount: quote.toAmount,
      feeInFromCurrency: quote.feeInFromCurrency,
      exchangeRate: quote.exchangeRate,
    } satisfies Record<string, unknown>

    const debitTx = await tx.moneyTransferWalletTransaction.create({
      data: {
        walletId: sourceWallet.id,
        userId: args.userId,
        type: "DEBIT",
        amount: fromAmount,
        balanceAfter: sourceBalanceAfter,
        currency: fromCurrency,
        description: `Converted ${fromCurrency} to ${toCurrency}`,
        reference: `${pairRef}_DR`,
        metadata: sharedMeta as Prisma.InputJsonValue,
      },
    })

    const creditTx = await tx.moneyTransferWalletTransaction.create({
      data: {
        walletId: destWallet.id,
        userId: args.userId,
        type: "CREDIT",
        amount: quote.toAmount,
        balanceAfter: destBalanceAfter,
        currency: toCurrency,
        description: `Received from ${fromCurrency} conversion`,
        reference: `${pairRef}_CR`,
        metadata: {
          ...sharedMeta,
          linkedDebitTransactionId: debitTx.id,
        } as Prisma.InputJsonValue,
      },
    })

    await tx.moneyTransferWallet.update({
      where: { id: sourceWallet.id },
      data: { balance: sourceBalanceAfter },
    })

    await tx.moneyTransferWallet.update({
      where: { id: destWallet.id },
      data: { balance: destBalanceAfter },
    })

    return {
      quote,
      debitTransactionId: debitTx.id,
      creditTransactionId: creditTx.id,
      sourceWallet: { currency: fromCurrency, balance: sourceBalanceAfter },
      destWallet: { currency: toCurrency, balance: destBalanceAfter },
    }
  })
}
