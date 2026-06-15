import { MoneyTransferSettlementMode } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { creditMoneyTransferWalletFromTransfer, getMoneyTransferSettlementMode } from "@/lib/money-transfer-wallet"
import { getMoneyTransferFxRate } from "@/lib/money-fx-rate"
import {
  notifyMoneyBankPayoutProcessing,
  notifyMoneyTransferCompleted,
} from "@/lib/money-transfer-notifications"

export type PaystackBankAccount = {
  bankName: string
  accountNumber: string
  accountHolderName: string
  routingNumber?: string | null
  swiftCode?: string | null
}

function isPaystackTransferRestricted(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes("starter") ||
    m.includes("third party") ||
    m.includes("third-party") ||
    m.includes("cannot initiate") ||
    m.includes("transfer is not allowed")
  )
}

async function queuePaystackPayoutForManualProcessing(args: {
  payoutId: string
  transferId: string
  transferMetadata: unknown
  reason: string
  paystackResponse?: unknown
  bankAccount: PaystackBankAccount
}) {
  await prisma.moneyTransferPayout.update({
    where: { id: args.payoutId },
    data: {
      status: "PENDING",
      failureReason: args.reason,
      paystackResponse: (args.paystackResponse ?? { queued: true, reason: args.reason }) as object,
    },
  })

  await prisma.moneyTransfer.update({
    where: { id: args.transferId },
    data: {
      status: "PROCESSING",
      receiverBankName: args.bankAccount.bankName,
      receiverAccountNumber: args.bankAccount.accountNumber,
      receiverAccountName: args.bankAccount.accountHolderName,
      receiverBankCode: args.bankAccount.routingNumber || args.bankAccount.swiftCode || "",
      metadata: {
        ...(args.transferMetadata as object),
        payoutQueued: true,
        payoutPendingReason: args.reason,
      },
    },
  })
}

async function getMoneyTransferPaystackSecretKey(): Promise<string> {
  const config = await prisma.moneyTransferConfig.findFirst()
  if (config?.paystackSecretKey) return config.paystackSecretKey
  if (process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY) {
    return process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY
  }
  throw new Error("Money Transfer Paystack configuration not found")
}

async function verifyPaystackTransferReference(secretKey: string, reference: string) {
  const res = await fetch(
    `https://api.paystack.co/transfer/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  )
  const json = await res.json()
  if (!json?.status || !json?.data) {
    throw new Error(json?.message || "Paystack transfer verification failed")
  }
  return json.data as { status?: string }
}

export async function initiatePaystackPayoutForTransfer(
  transfer: {
    id: string
    reference: string
    metadata: unknown
    receiverId: string
  },
  bankAccount: PaystackBankAccount,
  ngnAmount: number,
  stripePaymentIntentId?: string,
): Promise<{ reference?: string; queued: boolean; reason?: string }> {
  const paystackSecretKey = await getMoneyTransferPaystackSecretKey()

  const payout = await prisma.moneyTransferPayout.create({
    data: {
      transferId: transfer.id,
      amount: Math.round(ngnAmount * 100),
      currency: "NGN",
      bankName: bankAccount.bankName,
      accountNumber: bankAccount.accountNumber,
      accountName: bankAccount.accountHolderName,
      bankCode: bankAccount.routingNumber || bankAccount.swiftCode || "",
      status: "PENDING",
    },
  })

  const recipientResponse = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: bankAccount.accountHolderName,
      account_number: bankAccount.accountNumber,
      bank_code: bankAccount.routingNumber || bankAccount.swiftCode || "",
      currency: "NGN",
    }),
  })

  const recipientData = await recipientResponse.json()
  if (!recipientData.status) {
    const msg = recipientData.message || "Failed to create Paystack recipient"
    if (isPaystackTransferRestricted(msg)) {
      await queuePaystackPayoutForManualProcessing({
        payoutId: payout.id,
        transferId: transfer.id,
        transferMetadata: transfer.metadata,
        reason: msg,
        paystackResponse: recipientData,
        bankAccount,
      })
      return { queued: true, reason: msg }
    }
    throw new Error(msg)
  }

  const recipientCode = recipientData.data.recipient_code
  await prisma.moneyTransferPayout.update({
    where: { id: payout.id },
    data: { paystackRecipientCode: recipientCode },
  })

  const transferResponse = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(ngnAmount * 100),
      recipient: recipientCode,
      reference: `MT_${transfer.reference}_${Date.now()}`,
      reason: `Money transfer withdrawal: ${transfer.reference}`,
    }),
  })

  const transferData = await transferResponse.json()
  if (!transferData.status) {
    const msg = transferData.message || "Paystack transfer failed"
    if (isPaystackTransferRestricted(msg)) {
      await queuePaystackPayoutForManualProcessing({
        payoutId: payout.id,
        transferId: transfer.id,
        transferMetadata: transfer.metadata,
        reason: msg,
        paystackResponse: transferData,
        bankAccount,
      })
      return { queued: true, reason: msg }
    }
    await prisma.moneyTransferPayout.update({
      where: { id: payout.id },
      data: {
        status: "FAILED",
        failureReason: msg,
        paystackResponse: transferData,
        failedAt: new Date(),
      },
    })
    throw new Error(msg)
  }

  const paystackRef = transferData.data?.reference as string | undefined
  if (!paystackRef) {
    throw new Error("Paystack response missing transfer reference")
  }

  const verified = await verifyPaystackTransferReference(paystackSecretKey, paystackRef)
  if (verified.status === "failed") {
    throw new Error("Paystack reported transfer as failed after verify")
  }

  await prisma.moneyTransferPayout.update({
    where: { id: payout.id },
    data: {
      status: "PROCESSING",
      paystackTransferCode: transferData.data.transfer_code,
      paystackReference: transferData.data.reference,
      paystackResponse: transferData,
      processedAt: new Date(),
    },
  })

  await prisma.moneyTransfer.update({
    where: { id: transfer.id },
    data: {
      status: "SENT",
      receiverBankName: bankAccount.bankName,
      receiverAccountNumber: bankAccount.accountNumber,
      receiverAccountName: bankAccount.accountHolderName,
      receiverBankCode: bankAccount.routingNumber || bankAccount.swiftCode || "",
      metadata: {
        ...(transfer.metadata as object),
        paystackReference: transferData.data.reference,
        paystackTransferCode: transferData.data.transfer_code,
        stripePaymentIntentId,
      },
    },
  })

  return { reference: transferData.data.reference, queued: false }
}

async function resolveNgnAmount(transfer: {
  amount: number
  currency: string
  receiveAmount: number | null
  receiveCurrency: string | null
  ngnAmount: number | null
  exchangeRate: number | null
  customerRate: number | null
}): Promise<{ ngnAmount: number; exchangeRate: number }> {
  if (transfer.receiveAmount != null && transfer.customerRate != null && transfer.customerRate > 0) {
    return { ngnAmount: transfer.receiveAmount, exchangeRate: transfer.customerRate }
  }
  if (transfer.customerRate != null && transfer.customerRate > 0) {
    return { ngnAmount: transfer.amount * transfer.customerRate, exchangeRate: transfer.customerRate }
  }
  if (transfer.ngnAmount != null && transfer.exchangeRate != null && transfer.exchangeRate > 0) {
    return { ngnAmount: transfer.ngnAmount, exchangeRate: transfer.exchangeRate }
  }
  let exchangeRate = 1500
  let ngnAmount = transfer.amount * exchangeRate
  try {
    const r = await getMoneyTransferFxRate(transfer.currency, "NGN")
    if (r != null && r > 0) {
      exchangeRate = r
      ngnAmount = transfer.amount * exchangeRate
    }
  } catch {
    // use fallback
  }
  return { ngnAmount, exchangeRate }
}

/** Called after sender payment succeeds (Stripe webhook or Paystack confirm). */
export async function settleMoneyTransferAfterPayment(transferId: string, paymentIntentId?: string) {
  const transfer = await prisma.moneyTransfer.findUnique({
    where: { id: transferId },
    include: {
      payout: true,
      sender: true,
      receiver: {
        include: {
          bankAccounts: {
            where: { isVerified: true },
            orderBy: { isDefault: "desc" },
            take: 1,
          },
        },
      },
    },
  })

  if (!transfer) throw new Error(`Transfer not found: ${transferId}`)

  const settlementMode =
    transfer.settlementMode ?? (await getMoneyTransferSettlementMode())

  if (transfer.payout) return { mode: settlementMode, skipped: true, reason: "payout_exists" }
  if (transfer.status === "COMPLETED") {
    return { mode: settlementMode, skipped: true, reason: "already_completed" }
  }
  const existingWalletCredit = await prisma.moneyTransferWalletTransaction.findFirst({
    where: { transferId, type: "CREDIT" },
  })
  if (existingWalletCredit) {
    return { mode: settlementMode, skipped: true, reason: "wallet_already_credited" }
  }
  if (!["PENDING", "PROCESSING"].includes(transfer.status)) {
    return { mode: settlementMode, skipped: true, reason: "already_finalized" }
  }

  const { ngnAmount, exchangeRate } = await resolveNgnAmount(transfer)

  await prisma.moneyTransfer.update({
    where: { id: transfer.id },
    data: {
      ngnAmount,
      exchangeRate,
      status: "PROCESSING",
      sentAt: new Date(),
    },
  })

  if (settlementMode === MoneyTransferSettlementMode.WALLET) {
    await creditMoneyTransferWalletFromTransfer(transfer.id)

    await notifyMoneyTransferCompleted(
      {
        transferId: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        receiveAmount: transfer.receiveAmount,
        receiveCurrency: transfer.receiveCurrency,
        sender: transfer.sender,
        receiver: transfer.receiver,
      },
      "Credited to Kilo wallet.",
    )

    return { mode: settlementMode, walletCredited: true }
  }

  const storedBank =
    transfer.receiverAccountNumber && transfer.receiverBankName
      ? {
          bankName: transfer.receiverBankName,
          accountNumber: transfer.receiverAccountNumber,
          accountHolderName: transfer.receiverAccountName || "",
          routingNumber: transfer.receiverBankCode,
          swiftCode: transfer.receiverBankCode,
        }
      : null

  if (!storedBank && !transfer.receiver.bankAccounts?.length) {
    await prisma.moneyTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        metadata: {
          ...(transfer.metadata as object),
          failureReason: "Receiver bank account not verified",
        },
      },
    })
    throw new Error("Receiver bank account required for direct bank settlement")
  }

  const bankAccount = storedBank ?? {
    bankName: transfer.receiver.bankAccounts[0].bankName,
    accountNumber: transfer.receiver.bankAccounts[0].accountNumber,
    accountHolderName: transfer.receiver.bankAccounts[0].accountHolderName,
    routingNumber: transfer.receiver.bankAccounts[0].routingNumber,
    swiftCode: transfer.receiver.bankAccounts[0].swiftCode,
  }
  const payoutResult = await initiatePaystackPayoutForTransfer(
    transfer,
    {
      bankName: bankAccount.bankName,
      accountNumber: bankAccount.accountNumber,
      accountHolderName: bankAccount.accountHolderName,
      routingNumber: bankAccount.routingNumber,
      swiftCode: bankAccount.swiftCode,
    },
    ngnAmount,
    paymentIntentId,
  )

  if (payoutResult.queued) {
    await notifyMoneyBankPayoutProcessing(
      {
        transferId: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        receiveAmount: transfer.receiveAmount,
        receiveCurrency: transfer.receiveCurrency,
        sender: transfer.sender,
        receiver: transfer.receiver,
      },
      ngnAmount,
      bankAccount.bankName,
    )

    return {
      mode: settlementMode,
      payoutQueued: true,
      reason: payoutResult.reason,
    }
  }

  await notifyMoneyBankPayoutProcessing(
    {
      transferId: transfer.id,
      amount: transfer.amount,
      currency: transfer.currency,
      receiveAmount: transfer.receiveAmount,
      receiveCurrency: transfer.receiveCurrency,
      sender: transfer.sender,
      receiver: transfer.receiver,
    },
    ngnAmount,
    bankAccount.bankName,
  )

  return { mode: settlementMode, paystackInitiated: true }
}
