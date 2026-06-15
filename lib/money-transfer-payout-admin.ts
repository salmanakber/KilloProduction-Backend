import { MoneyTransferPayoutStatus, MoneyTransferStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  loadTransferNotifyContext,
  notifyMoneyBankPayoutCompleted,
  notifyMoneyBankPayoutProcessing,
  notifyMoneyTransferFailed,
} from "@/lib/money-transfer-notifications"

async function getMoneyTransferPaystackSecretKey(): Promise<string> {
  const config = await prisma.moneyTransferConfig.findFirst()
  if (config?.paystackSecretKey) return config.paystackSecretKey
  if (process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY) {
    return process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY
  }
  throw new Error("Money Transfer Paystack configuration not found")
}

export async function processTransferPayoutViaPaystack(payoutId: string) {
  const payout = await prisma.moneyTransferPayout.findUnique({
    where: { id: payoutId },
    include: { transfer: true },
  })

  if (!payout) throw new Error("Payout not found")

  if (!["PENDING", "FAILED"].includes(payout.status)) {
    throw new Error(`Cannot process payout with status: ${payout.status}`)
  }

  const paystackSecretKey = await getMoneyTransferPaystackSecretKey()
  let recipientCode = payout.paystackRecipientCode

  if (!recipientCode) {
    const recipientResponse = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "nuban",
        name: payout.accountName,
        account_number: payout.accountNumber,
        bank_code: payout.bankCode,
        currency: "NGN",
      }),
    })

    const recipientData = await recipientResponse.json()
    if (!recipientData.status) {
      throw new Error(recipientData.message || "Failed to create Paystack recipient")
    }

    recipientCode = recipientData.data.recipient_code
    await prisma.moneyTransferPayout.update({
      where: { id: payout.id },
      data: { paystackRecipientCode: recipientCode },
    })
  }

  const transferResponse = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: payout.amount,
      recipient: recipientCode,
      reference: `MT_${payout.transfer.reference}_${Date.now()}`,
      reason: `Money transfer payout: ${payout.transfer.reference}`,
    }),
  })

  const transferData = await transferResponse.json()
  if (!transferData.status) {
    await prisma.moneyTransferPayout.update({
      where: { id: payout.id },
      data: {
        status: "FAILED",
        failureReason: transferData.message || "Paystack transfer failed",
        paystackResponse: transferData,
        failedAt: new Date(),
        retryCount: payout.retryCount + 1,
        lastRetryAt: new Date(),
      },
    })
    throw new Error(transferData.message || "Paystack transfer failed")
  }

  await prisma.moneyTransferPayout.update({
    where: { id: payout.id },
    data: {
      status: "PROCESSING",
      paystackTransferCode: transferData.data.transfer_code,
      paystackReference: transferData.data.reference,
      paystackResponse: transferData,
      processedAt: new Date(),
      retryCount: payout.retryCount + 1,
      lastRetryAt: new Date(),
      failureReason: null,
      failedAt: null,
    },
  })

  await prisma.moneyTransfer.update({
    where: { id: payout.transferId },
    data: {
      status: "PROCESSING",
      metadata: {
        ...(payout.transfer.metadata as object),
        payoutQueued: false,
        payoutPendingReason: null,
      } as Prisma.InputJsonValue,
    },
  })

  const ctx = await loadTransferNotifyContext(payout.transferId)
  if (ctx) {
    await notifyMoneyBankPayoutProcessing(ctx, payout.amount / 100, payout.bankName)
  }

  return {
    paystackReference: transferData.data.reference as string,
    retryCount: payout.retryCount + 1,
  }
}

export async function markTransferPayoutCompletedManually(
  payoutId: string,
  adminId: string,
  reason: string,
) {
  const payout = await prisma.moneyTransferPayout.findUnique({
    where: { id: payoutId },
    include: {
      transfer: {
        include: {
          sender: { select: { id: true, name: true } },
          receiver: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!payout) throw new Error("Payout not found")

  if (["SUCCESS", "REVERSED"].includes(payout.status)) {
    throw new Error(`Payout already finalized: ${payout.status}`)
  }

  const now = new Date()
  const transferMeta = (payout.transfer.metadata as Record<string, unknown>) || {}

  await prisma.moneyTransferPayout.update({
    where: { id: payout.id },
    data: {
      status: MoneyTransferPayoutStatus.SUCCESS,
      completedAt: now,
      processedAt: payout.processedAt ?? now,
      failureReason: null,
      failedAt: null,
      metadata: {
        manualCompletion: {
          at: now.toISOString(),
          by: adminId,
          reason,
        },
      } as Prisma.InputJsonValue,
    },
  })

  await prisma.moneyTransfer.update({
    where: { id: payout.transferId },
    data: {
      status: MoneyTransferStatus.COMPLETED,
      completedAt: now,
      metadata: {
        ...transferMeta,
        payoutQueued: false,
        payoutPendingReason: null,
        manualPayoutCompleted: {
          at: now.toISOString(),
          by: adminId,
          reason,
        },
      } as Prisma.InputJsonValue,
    },
  })

  const ctx = await loadTransferNotifyContext(payout.transferId)
  if (ctx) {
    await notifyMoneyBankPayoutCompleted(
      ctx,
      payout.amount / 100,
      payout.bankName,
      payout.accountNumber.slice(-4),
    )
  }

  return { payoutId, transferId: payout.transfer.id, status: "SUCCESS" }
}

export async function markTransferPayoutFailedManually(
  payoutId: string,
  adminId: string,
  reason: string,
) {
  const payout = await prisma.moneyTransferPayout.findUnique({
    where: { id: payoutId },
    include: { transfer: true },
  })

  if (!payout) throw new Error("Payout not found")

  if (payout.status === "SUCCESS") {
    throw new Error("Cannot mark a successful payout as failed")
  }

  const now = new Date()
  const transferMeta = (payout.transfer.metadata as Record<string, unknown>) || {}

  await prisma.moneyTransferPayout.update({
    where: { id: payout.id },
    data: {
      status: MoneyTransferPayoutStatus.FAILED,
      failureReason: reason,
      failedAt: now,
      metadata: {
        manualFailure: { at: now.toISOString(), by: adminId, reason },
      } as Prisma.InputJsonValue,
    },
  })

  await prisma.moneyTransfer.update({
    where: { id: payout.transferId },
    data: {
      status: MoneyTransferStatus.FAILED,
      failedAt: now,
      metadata: {
        ...transferMeta,
        payoutQueued: false,
        adminPayoutFailed: { at: now.toISOString(), by: adminId, reason },
      } as Prisma.InputJsonValue,
    },
  })

  const ctx = await loadTransferNotifyContext(payout.transferId)
  if (ctx) {
    await notifyMoneyTransferFailed(ctx, reason)
  }

  return { payoutId, transferId: payout.transfer.id, status: "FAILED" }
}
